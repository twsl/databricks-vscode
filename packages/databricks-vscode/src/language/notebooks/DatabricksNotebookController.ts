import {
    NotebookController,
    NotebookCell,
    NotebookDocument,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookCellExecution,
    NotebookControllerAffinity,
    NotebookDocument as VscodeNotebookDocument,
    notebooks,
    workspace,
    Disposable,
    CancellationToken as VscodeCancellationToken,
} from "vscode";
import {
    CancellationToken as SdkCancellationToken,
    compute,
    logging,
} from "@databricks/sdk-experimental";
import {
    Cluster,
    ExecutionContext,
    CommandWithResult,
} from "../../sdk-extensions";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {parseCellMagic} from "./CellMagicParser";
import {Loggers} from "../../logger";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger} = logging;

class VscodeTokenAdapter implements SdkCancellationToken {
    constructor(private readonly token: VscodeCancellationToken) {}

    get isCancellationRequested(): boolean {
        return this.token.isCancellationRequested;
    }

    onCancellationRequested(listener: (e?: any) => any): void {
        this.token.onCancellationRequested(listener);
    }
}

export type KernelMode =
    | {type: "cluster"; cluster: Cluster}
    | {type: "serverless"};

export class DatabricksNotebookController implements Disposable {
    private readonly controller: NotebookController;
    private executionContexts: Map<string, ExecutionContext> = new Map();
    private executionOrder = 0;
    private disposables: Disposable[] = [];

    constructor(
        readonly mode: KernelMode,
        private readonly connectionManager: ConnectionManager
    ) {
        const id =
            mode.type === "cluster"
                ? `databricks.remote-${mode.cluster.id}`
                : "databricks.remote-serverless";
        const label =
            mode.type === "cluster"
                ? `Databricks: ${mode.cluster.name}`
                : "Databricks: Serverless";

        this.controller = notebooks.createNotebookController(
            id,
            "jupyter-notebook",
            label
        );

        this.controller.supportedLanguages = ["python", "sql", "r", "scala"];
        this.controller.description =
            mode.type === "cluster"
                ? `Remote execution on cluster ${mode.cluster.id}`
                : "Remote execution on serverless compute";
        this.controller.detail = this.buildDetail();
        this.controller.supportsExecutionOrder = true;
        this.controller.executeHandler = this.executeHandler.bind(this);

        this.disposables.push(
            workspace.onDidOpenNotebookDocument(
                (notebook: VscodeNotebookDocument) => {
                    this.setAffinityIfRelevant(notebook);
                }
            )
        );

        const modeLabel =
            mode.type === "cluster"
                ? `cluster ${mode.cluster.name} (${mode.cluster.id})`
                : "serverless";
        NamedLogger.getOrCreate(Loggers.Extension).info(
            `Created Databricks notebook kernel for ${modeLabel}`
        );
    }

    private buildDetail(): string {
        if (this.mode.type === "cluster") {
            const dbrVersion = this.mode.cluster.dbrVersion;
            return `DBR ${dbrVersion.join(".")}, ${this.mode.cluster.state}`;
        }
        return "Serverless Compute";
    }

    private setAffinityIfRelevant(notebook: NotebookDocument): void {
        const syncDest = this.connectionManager.syncDestinationMapper;
        if (!syncDest) {
            return;
        }
        const notebookPath = notebook.uri.fsPath;
        const localRoot = syncDest.localUri.uri.fsPath;
        if (notebookPath.startsWith(localRoot)) {
            this.controller.updateNotebookAffinity(
                notebook,
                NotebookControllerAffinity.Preferred
            );
        }
    }

    private async getOrCreateContext(
        notebookUri: string,
        language: compute.Language
    ): Promise<ExecutionContext> {
        const existing = this.executionContexts.get(notebookUri);
        if (existing) {
            return existing;
        }

        const apiClient = this.connectionManager.apiClient;
        if (!apiClient) {
            throw new Error("Not connected to Databricks");
        }

        let cluster: Cluster;
        if (this.mode.type === "cluster") {
            cluster = this.mode.cluster;
        } else {
            // For serverless, we create a pseudo-Cluster wrapper that passes
            // the serverless compute id to the Command Execution 1.2 API.
            const computeId = apiClient.config.serverlessComputeId ?? "auto";
            cluster = {id: computeId} as unknown as Cluster;
        }

        const ctx = await ExecutionContext.create(apiClient, cluster, language);
        this.executionContexts.set(notebookUri, ctx);
        return ctx;
    }

    private async executeHandler(
        cells: NotebookCell[],
        notebook: NotebookDocument,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _controller: NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this.executeCell(cell, notebook);
        }
    }

    private async executeCell(
        cell: NotebookCell,
        notebook: NotebookDocument
    ): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this.executionOrder;
        execution.start(Date.now());
        execution.clearOutput();

        try {
            const cellText = cell.document.getText();
            const parsed = parseCellMagic(cellText);

            // Handle markdown magic locally
            if (parsed.magic === "md" || parsed.magic === "md-sandbox") {
                execution.appendOutput(
                    new NotebookCellOutput([
                        NotebookCellOutputItem.text(
                            parsed.commandText,
                            "text/markdown"
                        ),
                    ])
                );
                execution.end(true, Date.now());
                return;
            }

            // Handle %skip — cell should not execute
            if (parsed.magic === "skip") {
                execution.appendOutput(
                    new NotebookCellOutput([
                        NotebookCellOutputItem.text(
                            "Cell skipped (%skip).",
                            "text/plain"
                        ),
                    ])
                );
                execution.end(true, Date.now());
                return;
            }

            // Unsupported magics
            if (
                parsed.magic === "sh" ||
                parsed.magic === "fs" ||
                parsed.magic === "tensorboard"
            ) {
                execution.appendOutput(
                    new NotebookCellOutput([
                        NotebookCellOutputItem.text(
                            `Magic %${parsed.magic} is not supported for remote execution.`,
                            "text/plain"
                        ),
                    ])
                );
                execution.end(false, Date.now());
                return;
            }

            if (parsed.magic === "run") {
                execution.appendOutput(
                    new NotebookCellOutput([
                        NotebookCellOutputItem.text(
                            "%run is not yet supported by the Databricks remote kernel.",
                            "text/plain"
                        ),
                    ])
                );
                execution.end(false, Date.now());
                return;
            }

            const execContext = await this.getOrCreateContext(
                notebook.uri.toString(),
                parsed.language
            );

            const sdkToken = new VscodeTokenAdapter(execution.token);
            let cmdResult: CommandWithResult;

            try {
                cmdResult = await execContext.execute(
                    parsed.commandText,
                    undefined,
                    sdkToken
                );
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);

                // If context was destroyed or invalid, remove it so next execution recreates
                this.executionContexts.delete(notebook.uri.toString());

                execution.appendOutput(
                    new NotebookCellOutput([
                        NotebookCellOutputItem.error(
                            new Error(`Execution failed: ${message}`)
                        ),
                    ])
                );
                execution.end(false, Date.now());
                return;
            }

            this.renderResult(execution, cmdResult);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            execution.appendOutput(
                new NotebookCellOutput([
                    NotebookCellOutputItem.error(new Error(message)),
                ])
            );
            execution.end(false, Date.now());
        }
    }

    private renderResult(
        execution: NotebookCellExecution,
        cmdResult: CommandWithResult
    ): void {
        const results = cmdResult.result.results;
        if (!results) {
            execution.end(true, Date.now());
            return;
        }

        switch (results.resultType) {
            case "text":
                this.renderTextResult(execution, results);
                break;
            case "table":
                this.renderTableResult(execution, results);
                break;
            case "images":
                this.renderImageResult(execution, results);
                break;
            case "error":
                this.renderErrorResult(execution, results);
                return; // renderErrorResult calls execution.end
            default:
                if (results.data) {
                    execution.appendOutput(
                        new NotebookCellOutput([
                            NotebookCellOutputItem.text(
                                String(results.data),
                                "text/plain"
                            ),
                        ])
                    );
                }
                break;
        }

        execution.end(cmdResult.result.status === "Finished", Date.now());
    }

    private renderTextResult(
        execution: NotebookCellExecution,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        results: compute.Results
    ): void {
        const textData = results.data as string;
        if (!textData) {
            return;
        }

        const output = new NotebookCellOutput([]);
        output.items.push(NotebookCellOutputItem.text(textData, "text/plain"));

        // If the output looks like HTML, also render it as HTML
        if (
            textData.includes("<!DOCTYPE html>") ||
            textData.includes("</html>") ||
            textData.includes("</div>") ||
            textData.includes("</table>")
        ) {
            output.items.push(
                NotebookCellOutputItem.text(textData.trim(), "text/html")
            );
        }

        execution.appendOutput(output);
    }

    private renderTableResult(
        execution: NotebookCellExecution,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        results: compute.Results
    ): void {
        const data = results.data as any[];
        const schema = results.schema as Array<{name: string; type: string}>;

        if (!data || data.length === 0) {
            execution.appendOutput(
                new NotebookCellOutput([
                    NotebookCellOutputItem.text(
                        "<Empty result set>",
                        "text/plain"
                    ),
                ])
            );
            return;
        }

        let html =
            '<div style="height:300px;overflow:auto;resize:both;"><table style="width:100%"><thead><tr>';
        for (const col of schema) {
            html += `<th>${this.escapeHtml(col.name)}</th>`;
        }
        html += "</tr></thead><tbody>";

        const jsonData: Record<string, unknown>[] = [];
        for (const row of data) {
            const newRow: Record<string, unknown> = {};
            html += "<tr>";
            for (let i = 0; i < schema.length; i++) {
                html += `<td>${this.escapeHtml(String(row[i]))}</td>`;
                newRow[schema[i].name] = row[i];
            }
            html += "</tr>";
            jsonData.push(newRow);
        }
        html += "</tbody></table></div>";

        execution.appendOutput(
            new NotebookCellOutput([
                NotebookCellOutputItem.text(html, "text/html"),
                NotebookCellOutputItem.json(jsonData, "application/json"),
            ])
        );
    }

    private renderImageResult(
        execution: NotebookCellExecution,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        results: compute.Results
    ): void {
        const fileNames = results.fileNames as string[];
        if (!fileNames) {
            return;
        }

        for (const fileName of fileNames) {
            const mimeType = fileName.split(";")[0].split(":")[1];
            const content = fileName.split(";", 2)[1];
            const base64Data = content.split(",")[1];
            execution.appendOutput(
                new NotebookCellOutput([
                    new NotebookCellOutputItem(
                        Uint8Array.from(atob(base64Data), (c) =>
                            c.charCodeAt(0)
                        ),
                        mimeType
                    ),
                ])
            );
        }
    }

    private renderErrorResult(
        execution: NotebookCellExecution,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        results: compute.Results
    ): void {
        if (results.summary) {
            execution.appendOutput(
                new NotebookCellOutput([
                    NotebookCellOutputItem.text(results.summary, "text/html"),
                ])
            );
        }

        execution.appendOutput(
            new NotebookCellOutput([
                NotebookCellOutputItem.error(
                    new Error(results.cause || "Unknown error")
                ),
            ])
        );

        execution.end(false, Date.now());
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    async restart(): Promise<void> {
        const modeLabel =
            this.mode.type === "cluster"
                ? `cluster ${this.mode.cluster.name}`
                : "serverless";
        NamedLogger.getOrCreate(Loggers.Extension).info(
            `Restarting Databricks kernel for ${modeLabel}`
        );
        for (const [uri, ctx] of this.executionContexts) {
            try {
                await ctx.destroy();
            } catch (e) {
                NamedLogger.getOrCreate(Loggers.Extension).error(
                    `Failed to destroy execution context for ${uri}`,
                    e
                );
            }
        }
        this.executionContexts.clear();
    }

    async dispose(): Promise<void> {
        for (const [, ctx] of this.executionContexts) {
            try {
                await ctx.destroy();
            } catch {
                // best-effort cleanup
            }
        }
        this.executionContexts.clear();
        this.controller.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}

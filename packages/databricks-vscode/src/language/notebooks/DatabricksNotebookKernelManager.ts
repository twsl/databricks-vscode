import {Disposable, commands, window} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Cluster} from "../../sdk-extensions";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {
    DatabricksNotebookController,
    KernelMode,
} from "./DatabricksNotebookController";
import {Loggers} from "../../logger";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger} = logging;

export class DatabricksNotebookKernelManager implements Disposable {
    private controller?: DatabricksNotebookController;
    private disposables: Disposable[] = [];

    constructor(private readonly connectionManager: ConnectionManager) {
        this.disposables.push(
            connectionManager.onDidChangeCluster(
                (cluster: Cluster | undefined) => this.onClusterChanged(cluster)
            ),
            connectionManager.onDidChangeState(() => this.reconcile())
        );

        // Initial reconciliation
        this.reconcile();
    }

    /**
     * Determine the correct kernel mode based on current connection state
     * and create/dispose the controller as needed.
     */
    private reconcile(): void {
        const mode = this.resolveMode();

        // If current controller already matches the desired mode, keep it
        if (this.controllerMatchesMode(mode)) {
            return;
        }

        // Dispose old controller and create new one if needed
        this.disposeController();

        if (mode) {
            this.createController(mode);
        }
    }

    private resolveMode(): KernelMode | undefined {
        if (this.connectionManager.state !== "CONNECTED") {
            return undefined;
        }

        if (this.connectionManager.serverless) {
            return {type: "serverless"};
        }

        const cluster = this.connectionManager.cluster;
        if (cluster && cluster.state === "RUNNING") {
            return {type: "cluster", cluster};
        }

        return undefined;
    }

    private controllerMatchesMode(mode: KernelMode | undefined): boolean {
        if (!this.controller && !mode) {
            return true;
        }
        if (!this.controller || !mode) {
            return false;
        }

        const current = this.controller.mode;
        if (current.type !== mode.type) {
            return false;
        }
        if (
            current.type === "cluster" &&
            mode.type === "cluster" &&
            current.cluster.id !== mode.cluster.id
        ) {
            return false;
        }
        return true;
    }

    private async onClusterChanged(
        _cluster: Cluster | undefined
    ): Promise<void> {
        this.reconcile();
    }

    private createController(mode: KernelMode): void {
        try {
            this.controller = new DatabricksNotebookController(
                mode,
                this.connectionManager
            );
        } catch (e) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to create Databricks notebook kernel",
                e
            );
        }
    }

    private async disposeController(): Promise<void> {
        if (this.controller) {
            try {
                await this.controller.dispose();
            } catch (e) {
                NamedLogger.getOrCreate(Loggers.Extension).error(
                    "Failed to dispose Databricks notebook kernel",
                    e
                );
            }
            this.controller = undefined;
        }
    }

    async restartKernel(): Promise<void> {
        if (!this.controller) {
            window.showWarningMessage(
                "No active Databricks kernel to restart."
            );
            return;
        }
        await this.controller.restart();
        window.showInformationMessage("Databricks kernel restarted.");
    }

    dispose(): void {
        this.disposeController();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}

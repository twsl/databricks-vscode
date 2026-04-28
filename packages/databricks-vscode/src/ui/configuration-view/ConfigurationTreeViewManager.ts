import {
    TreeView,
    TreeCheckboxChangeEvent,
    Disposable,
    TreeItemCheckboxState,
    window,
} from "vscode";
import {ConfigurationTreeItem} from "./types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {CLUSTER_OVERRIDE_CHECKBOX_ID} from "./ClusterComponent";

export class ConfigurationTreeViewManager implements Disposable {
    private readonly disposables: Disposable[] = [];
    constructor(
        readonly treeView: TreeView<ConfigurationTreeItem>,
        readonly configModel: ConfigModel,
        readonly connectionManager: ConnectionManager
    ) {
        this.disposables.push(
            treeView.onDidChangeCheckboxState(
                async (e: TreeCheckboxChangeEvent<ConfigurationTreeItem>) => {
                    await Promise.all(
                        e.items.map(async ([item, state]) => {
                            if (item.id === CLUSTER_OVERRIDE_CHECKBOX_ID) {
                                if (
                                    state ===
                                        TreeItemCheckboxState.Checked &&
                                    !this.connectionManager.cluster?.supportsJobs()
                                ) {
                                    window.showWarningMessage(
                                        "This cluster does not support jobs workload. Select a cluster with jobs workload enabled to use this feature."
                                    );
                                    return;
                                }
                                await this.configModel.set(
                                    "useClusterOverride",
                                    state === TreeItemCheckboxState.Checked
                                );
                            }
                        })
                    );
                }
            )
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}

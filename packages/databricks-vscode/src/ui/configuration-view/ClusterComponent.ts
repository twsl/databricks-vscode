import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    ThemeColor,
    TreeItemCheckboxState,
} from "vscode";
import {ConfigurationTreeItem} from "./types";
import {Cluster} from "../../sdk-extensions";
import {onError} from "../../utils/onErrorDecorator";
import {DecorationUtils} from "../utils";
import {LabelUtils} from "../utils";

const TREE_ICON_ID = "CLUSTER";
export const CLUSTER_OVERRIDE_CHECKBOX_ID = "OVERRIDE_CLUSTER";
export const SERVERLESS_ENVIRONMENT_ID = "SERVERLESS_ENVIRONMENT";
export const SERVERLESS_HARDWARE_ID = "SERVERLESS_HARDWARE";
export const SERVERLESS_USAGE_POLICY_ID = "SERVERLESS_USAGE_POLICY";

function getContextValue(key: string) {
    return `databricks.configuration.cluster.${key}`;
}

function getTreeItemsForClusterState(cluster: Cluster) {
    let icon, contextValue;
    switch (cluster.state) {
        case "RESIZING":
        case "RUNNING":
            icon = new ThemeIcon("debug-start");
            contextValue = getContextValue("running");
            break;

        case "RESTARTING":
        case "PENDING":
            icon = new ThemeIcon(
                "sync~spin",
                new ThemeColor("debugIcon.startForeground")
            );
            contextValue = getContextValue("pending");
            break;

        case "TERMINATING":
            icon = new ThemeIcon(
                "sync~spin",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = getContextValue("terminating");
            break;

        case "TERMINATED":
            icon = new ThemeIcon(
                "stop-circle",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = getContextValue("terminated");
            break;

        case "ERROR":
            icon = new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = getContextValue("error");
            break;

        default:
            icon = new ThemeIcon("question");
            contextValue = getContextValue("unknown");
            break;
    }

    return {icon, contextValue};
}

export class ClusterComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeCluster(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("useClusterOverride")(async () => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("serverlessEnvironmentVersion")(
                async () => {
                    this.onDidChangeEmitter.fire();
                }
            ),
            this.configModel.onDidChangeKey("serverlessHardware")(async () => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("serverlessBudgetPolicyId")(
                async () => {
                    this.onDidChangeEmitter.fire();
                }
            ),
            this.configModel.onDidChangeKey("serverlessCustomEnvironmentPath")(
                async () => {
                    this.onDidChangeEmitter.fire();
                }
            )
        );
    }

    @onError({popup: true})
    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        if (this.connectionManager.serverless) {
            const resolvedServerlessEnvironment =
                await this.connectionManager.resolveServerlessEnvironment();
            if (!resolvedServerlessEnvironment) {
                return [];
            }
            const hardwareOption =
                this.connectionManager.serverlessEnvironmentService?.getHardwareOption(
                    resolvedServerlessEnvironment.hardware
                );
            const hardwareLabel =
                hardwareOption?.label ?? resolvedServerlessEnvironment.hardware;
            const description =
                resolvedServerlessEnvironment.customEnvironmentPath
                    ? `Custom | ${hardwareLabel}`
                    : `${resolvedServerlessEnvironment.environment.label} | ${hardwareLabel}`;
            return [
                {
                    label: "Serverless",
                    description,
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                    contextValue: getContextValue("serverless"),
                    iconPath: new ThemeIcon(
                        "cloud",
                        new ThemeColor("debugIcon.startForeground")
                    ),
                    id: TREE_ICON_ID,
                },
            ];
        }

        const configClusterId = await this.configModel.get("clusterId");
        if (configClusterId === undefined) {
            // Cluster is not set in bundle and override
            // We are logged in -> Select cluster prompt
            return [
                {
                    label: LabelUtils.highlightedLabel("Select a cluster"),
                    collapsibleState: TreeItemCollapsibleState.None,
                    contextValue: getContextValue("none"),
                    iconPath: new ThemeIcon(
                        "server",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    id: TREE_ICON_ID,
                    command: {
                        title: "Select a cluster",
                        command: "databricks.connection.attachClusterQuickPick",
                    },
                },
            ];
        }

        // Cluster is set in bundle / override
        // We are logged in -> load cluster details
        const cluster = this.connectionManager.cluster;
        if (cluster === undefined) {
            // can never happen. Just need it for typescript type coercing.
            return [];
        }
        const {icon, contextValue} = getTreeItemsForClusterState(cluster);
        const url = await cluster.url;
        const useClusterOverride =
            await this.configModel.get("useClusterOverride");
        const overrideClusterLabel = "Override Jobs cluster in bundle";
        const clusterOverrideTooltip =
            "Use the selected cluster for all jobs in the bundle";
        const clusterSupportsJobs = cluster.supportsJobs();

        const items: ConfigurationTreeItem[] = [
            {
                label: "Cluster",
                tooltip: url ? undefined : "Created after deploy",
                description: cluster.name,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                contextValue: url ? `${contextValue}.has-url` : contextValue,
                resourceUri: url
                    ? undefined
                    : DecorationUtils.getModifiedStatusDecoration(
                          TREE_ICON_ID,
                          "created"
                      ),
                iconPath: icon,
                id: TREE_ICON_ID,
                url,
            },
        ];

        if (clusterSupportsJobs) {
            items.push({
                label: useClusterOverride
                    ? LabelUtils.highlightedLabel(overrideClusterLabel)
                    : overrideClusterLabel,
                checkboxState: {
                    state: useClusterOverride
                        ? TreeItemCheckboxState.Checked
                        : TreeItemCheckboxState.Unchecked,
                    tooltip: clusterOverrideTooltip,
                },
                tooltip: clusterOverrideTooltip,
                id: CLUSTER_OVERRIDE_CHECKBOX_ID,
                collapsibleState: TreeItemCollapsibleState.None,
            });
        } else {
            items.push({
                label: overrideClusterLabel,
                description: "Not supported",
                tooltip:
                    "This cluster does not support jobs workload. Select a cluster with jobs workload enabled to use this feature.",
                iconPath: new ThemeIcon(
                    "warning",
                    new ThemeColor("notificationsWarningIcon.foreground")
                ),
                id: CLUSTER_OVERRIDE_CHECKBOX_ID,
                collapsibleState: TreeItemCollapsibleState.None,
            });
        }

        return items;
    }

    public async getChildren(
        parent?: TreeItem
    ): Promise<ConfigurationTreeItem[]> {
        // Only show cluster details when we are connected and in dev mode. In other modes
        // there is no concept of a global interactive cluster
        if (
            this.connectionManager.state !== "CONNECTED" ||
            (await this.configModel.get("mode")) !== "development"
        ) {
            return [];
        }
        if (parent === undefined) {
            return this.getRoot();
        }

        if (parent.id !== TREE_ICON_ID) {
            return [];
        }

        if (this.connectionManager.serverless) {
            const resolvedServerlessEnvironment =
                await this.connectionManager.resolveServerlessEnvironment();
            if (!resolvedServerlessEnvironment) {
                return [];
            }
            const environment = resolvedServerlessEnvironment.environment;
            const hardwareOption =
                this.connectionManager.serverlessEnvironmentService?.getHardwareOption(
                    resolvedServerlessEnvironment.hardware
                );
            const hardwareLabel = hardwareOption
                ? `${hardwareOption.label} (${hardwareOption.detail})`
                : resolvedServerlessEnvironment.hardware;
            const environmentDescription =
                resolvedServerlessEnvironment.customEnvironmentPath
                    ? `Custom: ${resolvedServerlessEnvironment.customEnvironmentPath}`
                    : environment.label;
            const children: ConfigurationTreeItem[] = [
                {
                    label: "Environment",
                    description: environmentDescription,
                    tooltip: resolvedServerlessEnvironment.customEnvironmentPath
                        ? `Using custom environment from ${resolvedServerlessEnvironment.customEnvironmentPath}`
                        : `${environment.detail}. Select the serverless environment used for workflow runs and Databricks Connect compatibility checks.`,
                    contextValue: getContextValue("serverless.environment"),
                    command: {
                        title: "Select serverless environment",
                        command:
                            "databricks.serverless.selectEnvironmentVersion",
                    },
                    collapsibleState: TreeItemCollapsibleState.None,
                    id: SERVERLESS_ENVIRONMENT_ID,
                },
                {
                    label: "Memory",
                    description: hardwareLabel,
                    tooltip:
                        "Serverless notebook memory preference. High memory applies through notebook settings and is not mapped to job performance targets.",
                    contextValue: getContextValue("serverless.hardware"),
                    command: {
                        title: "Select serverless memory",
                        command: "databricks.serverless.selectHardware",
                    },
                    collapsibleState: TreeItemCollapsibleState.None,
                    id: SERVERLESS_HARDWARE_ID,
                },
                {
                    label: "Usage Policy",
                    description:
                        resolvedServerlessEnvironment.budgetPolicyId ??
                        "Workspace default",
                    tooltip:
                        "Databricks budget policy ID to attribute serverless workflow runs. Leave unset to use the workspace default policy.",
                    contextValue: getContextValue("serverless.usage-policy"),
                    command: {
                        title: "Configure serverless usage policy",
                        command: "databricks.serverless.selectUsagePolicy",
                    },
                    collapsibleState: TreeItemCollapsibleState.None,
                    id: SERVERLESS_USAGE_POLICY_ID,
                },
            ];

            return children;
        }

        // If there is no cluster, we don't have to show cluster details
        if (this.connectionManager.cluster === undefined) {
            return [];
        }
        const cluster = this.connectionManager.cluster;
        const children: ConfigurationTreeItem[] = [
            {
                label: "Cluster ID",
                description: cluster.id,
            },
        ];

        children.push(
            {
                label: "Databricks Runtime",
                description: cluster.dbrVersion.join("."),
            },
            {
                label: "Creator",
                description: cluster.details.creator_user_name,
            }
        );

        if (cluster.stateMessage && cluster.state !== "RUNNING") {
            children.push({
                label: "State",
                description: `${cluster.state} - ${cluster.stateMessage}`,
            });
        }

        if (cluster.accessMode) {
            const description = cluster.isSingleUser()
                ? `${cluster.accessMode} - ${cluster.details.single_user_name}`
                : `${cluster.accessMode}`;
            children.push({
                label: "Access Mode",
                description: description,
            });
        }

        return children;
    }
}

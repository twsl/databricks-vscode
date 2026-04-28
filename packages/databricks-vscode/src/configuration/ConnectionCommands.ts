import {Cluster} from "../sdk-extensions";
import {
    Disposable,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    window,
    commands,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "./ConnectionManager";
import {UrlUtils} from "../utils";
import {WorkspaceFsCommands} from "../workspace-fs";
import {ConfigModel} from "./models/ConfigModel";
import {saveNewProfile} from "./LoginWizard";
import {PersonalAccessTokenAuthProvider} from "./auth/AuthProvider";
import {normalizeHost} from "../utils/urlUtils";
import {CliWrapper, ProcessError} from "../cli/CliWrapper";
import {
    AUTH_TYPE_SWITCH_ID,
    AUTH_TYPE_LOGIN_ID,
} from "../ui/configuration-view/AuthTypeComponent";
import {ManualLoginSource} from "../telemetry/constants";
import {onError} from "../utils/onErrorDecorator";
import {
    ServerlessEnvironmentService,
    SupportedServerlessEnvironment,
    ServerlessHardwareType,
    ServerlessHardwareOption,
} from "../serverless/ServerlessEnvironmentService";

function formatQuickPickClusterSize(sizeInMB: number): string {
    if (sizeInMB > 1024) {
        return Math.round(sizeInMB / 1024).toString() + " GB";
    } else {
        return `${sizeInMB} MB`;
    }
}
export function formatQuickPickClusterDetails(cluster: Cluster) {
    const details = [];
    if (cluster.memoryMb) {
        details.push(formatQuickPickClusterSize(cluster.memoryMb));
    }

    if (cluster.cores) {
        details.push(`${cluster.cores} Cores`);
    }

    details.push(cluster.sparkVersion);
    details.push(cluster.creator);

    return details.join(" | ");
}

export interface WorkspaceItem extends QuickPickItem {
    id?: number;
    path?: string;
}

export interface ClusterItem extends QuickPickItem {
    cluster: Cluster;
}

interface ServerlessEnvironmentItem extends QuickPickItem {
    environment?: SupportedServerlessEnvironment;
    isCustom?: boolean;
}

interface ServerlessHardwareItem extends QuickPickItem {
    hardware: ServerlessHardwareType;
}

export class ConnectionCommands implements Disposable {
    private disposables: Disposable[] = [];
    constructor(
        private wsfsCommands: WorkspaceFsCommands,
        private connectionManager: ConnectionManager,
        private readonly clusterModel: ClusterModel,
        private readonly configModel: ConfigModel,
        private readonly cli: CliWrapper,
        private readonly serverlessEnvironmentService: ServerlessEnvironmentService
    ) {}

    async selectServerlessHardware(arg?: {
        skipIfAlreadyConfigured?: boolean;
        title?: string;
    }) {
        const configuredHardware =
            await this.serverlessEnvironmentService.getConfiguredHardware();
        const defaultHardware =
            this.serverlessEnvironmentService.defaultHardware;
        if (
            arg?.skipIfAlreadyConfigured &&
            configuredHardware !== defaultHardware.id
        ) {
            return configuredHardware;
        }

        const hardwareOptions: ServerlessHardwareItem[] =
            this.serverlessEnvironmentService.supportedHardware.map(
                (option: ServerlessHardwareOption) => ({
                    label: option.label,
                    detail: option.detail,
                    hardware: option.id,
                    picked: configuredHardware === option.id,
                    description:
                        configuredHardware === option.id
                            ? "Current"
                            : option.isDefault
                              ? "Recommended"
                              : undefined,
                })
            );

        const selectedItem = await window.showQuickPick<ServerlessHardwareItem>(
            hardwareOptions,
            {
                title: arg?.title ?? "Select Serverless Hardware",
            }
        );
        if (!selectedItem) {
            return configuredHardware;
        }

        await this.serverlessEnvironmentService.setConfiguredHardware(
            selectedItem.hardware
        );
        return selectedItem.hardware;
    }

    async selectServerlessBudgetPolicy(arg?: {
        skipIfAlreadyConfigured?: boolean;
        title?: string;
    }) {
        const configuredBudgetPolicyId =
            await this.serverlessEnvironmentService.getConfiguredBudgetPolicyId();
        if (arg?.skipIfAlreadyConfigured && configuredBudgetPolicyId) {
            return configuredBudgetPolicyId;
        }

        const budgetPolicyId = await window.showInputBox({
            title: arg?.title ?? "Configure Serverless Usage Policy",
            prompt: "Enter the Databricks budget policy ID to attribute serverless runs. Leave empty to use the workspace default policy.",
            value: configuredBudgetPolicyId ?? "",
        });

        if (budgetPolicyId === undefined) {
            return configuredBudgetPolicyId;
        }

        await this.serverlessEnvironmentService.setConfiguredBudgetPolicyId(
            budgetPolicyId
        );
        return budgetPolicyId.trim() || undefined;
    }

    async selectServerlessEnvironmentVersion(arg?: {
        skipIfAlreadyConfigured?: boolean;
        title?: string;
    }) {
        const configuredEnvironment =
            await this.serverlessEnvironmentService.getConfiguredEnvironment();
        const customEnvironmentPath =
            await this.serverlessEnvironmentService.getConfiguredCustomEnvironmentPath();
        if (
            arg?.skipIfAlreadyConfigured &&
            (configuredEnvironment || customEnvironmentPath)
        ) {
            return configuredEnvironment;
        }

        const latestEnvironment =
            this.serverlessEnvironmentService.latestEnvironment;
        const selectableItems: ServerlessEnvironmentItem[] = [
            ...this.serverlessEnvironmentService.supportedEnvironments
                .slice()
                .reverse()
                .map((environment) => ({
                    label: environment.label,
                    description:
                        !customEnvironmentPath &&
                        configuredEnvironment?.version === environment.version
                            ? "Current"
                            : environment.version === latestEnvironment.version
                              ? "Recommended"
                              : undefined,
                    detail: environment.detail,
                    picked:
                        !customEnvironmentPath &&
                        (configuredEnvironment?.version ===
                            environment.version ||
                            (!configuredEnvironment &&
                                environment.version ===
                                    latestEnvironment.version)),
                    environment,
                })),
            {
                label: "",
                kind: QuickPickItemKind.Separator,
            },
            {
                label: "$(file-code) Custom (environment.yml)",
                detail: customEnvironmentPath
                    ? `Current: ${customEnvironmentPath}`
                    : "Specify a YAML file with a custom environment definition",
                description: customEnvironmentPath ? "Current" : undefined,
                picked: !!customEnvironmentPath,
                isCustom: true,
            },
        ];

        const selectedItem =
            await window.showQuickPick<ServerlessEnvironmentItem>(
                selectableItems,
                {
                    title: arg?.title ?? "Select Serverless Environment",
                }
            );
        if (!selectedItem) {
            return configuredEnvironment;
        }

        if (selectedItem.isCustom) {
            const yamlPath = await window.showInputBox({
                title: "Custom Environment YAML Path",
                prompt: "Enter the workspace path to the environment.yml file (e.g. /Workspace/environments/custom.yml)",
                value: customEnvironmentPath ?? "",
                validateInput: (value) => {
                    if (!value.trim()) {
                        return "A YAML file path is required";
                    }
                    return undefined;
                },
            });
            if (yamlPath) {
                await this.serverlessEnvironmentService.setConfiguredCustomEnvironment(
                    yamlPath
                );
            }
            return configuredEnvironment;
        }

        if (selectedItem.environment) {
            await this.serverlessEnvironmentService.setConfiguredEnvironment(
                selectedItem.environment.version
            );
            return selectedItem.environment;
        }

        return configuredEnvironment;
    }

    /**
     * Disconnect from Databricks and reset project settings.
     */
    async logoutCommand() {
        this.connectionManager.logout();
    }

    async configureLoginCommand(arg?: {id: string}) {
        commands.executeCommand("configurationView.focus");
        let source: ManualLoginSource = "command";
        if (arg?.id === AUTH_TYPE_SWITCH_ID) {
            source = "authTypeSwitch";
        } else if (arg?.id === AUTH_TYPE_LOGIN_ID) {
            source = "authTypeLogin";
        }
        await window.withProgress(
            {
                location: {viewId: "configurationView"},
                title: "Configuring Databricks login",
            },
            async () => {
                await this.connectionManager.configureLogin(source);
            }
        );
    }

    // This command is not exposed to users.
    // We use it to test new profile flow in e2e tests.
    async saveNewProfileCommand(name: string) {
        const host = this.connectionManager.workspaceClient?.config.host;
        const token = this.connectionManager.workspaceClient?.config.token;
        if (!host || !token) {
            throw new Error("Must login first");
        }
        const hostUrl = normalizeHost(host);
        const provider = new PersonalAccessTokenAuthProvider(
            hostUrl,
            token,
            this.cli
        );
        await saveNewProfile(name, provider, this.cli);
    }

    /**
     * Attach to cluster from settings. If attach fails or no cluster is configured
     * then show dialog to select (or create) a cluster. The selected cluster is saved
     * in settings.
     */
    attachClusterCommand() {
        return async (cluster: Cluster) => {
            await this.connectionManager.attachCluster(cluster.id);
        };
    }

    attachClusterQuickPickCommand() {
        return async (title?: string) => {
            const workspaceClient = this.connectionManager.workspaceClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            if (!workspaceClient || !me) {
                // TODO
                return;
            }

            const quickPick = window.createQuickPick<
                ClusterItem | QuickPickItem
            >();
            quickPick.title =
                typeof title === "string" ? title : "Select Cluster";
            quickPick.keepScrollPosition = true;
            quickPick.busy = true;
            quickPick.canSelectMany = false;
            const items: QuickPickItem[] = [
                {
                    label: "$(cloud) Serverless",
                    detail: `Run files as Workflows or use Databricks Connect with managed serverless compute`,
                    alwaysShow: false,
                },
                {
                    label: "$(repo-create) Create New Cluster",
                    detail: `Open Databricks in the browser and create a new cluster`,
                    alwaysShow: false,
                },
                {
                    label: "",
                    kind: QuickPickItemKind.Separator,
                },
            ];
            quickPick.items = items;

            this.clusterModel.refresh();
            const refreshQuickPickItems = () => {
                const clusters = this.clusterModel.roots ?? [];
                quickPick.items = items.concat(
                    clusters.map((c) => {
                        const treeItem =
                            ClusterListDataProvider.clusterNodeToTreeItem(c);
                        return {
                            label: `$(${
                                (treeItem.iconPath as ThemeIcon).id
                            }) ${c.name!} (${c.id})`,
                            detail: formatQuickPickClusterDetails(c),
                            cluster: c,
                        };
                    })
                );
            };

            const disposables = [
                this.clusterModel.onDidChange(refreshQuickPickItems),
                quickPick,
            ];

            refreshQuickPickItems();
            quickPick.show();

            quickPick.onDidAccept(async () => {
                const selectedItem = quickPick.selectedItems[0];
                if ("cluster" in selectedItem) {
                    const cluster = selectedItem.cluster;
                    await this.connectionManager.attachCluster(cluster.id);
                } else if (selectedItem.label === "$(cloud) Serverless") {
                    await this.connectionManager.enableServerless();
                    await this.selectServerlessEnvironmentVersion({
                        skipIfAlreadyConfigured: true,
                        title: "Select Serverless Environment",
                    });
                } else {
                    await UrlUtils.openExternal(
                        `${
                            (
                                await this.connectionManager.workspaceClient
                                    ?.apiClient?.host
                            )?.href ?? ""
                        }#create/cluster`
                    );
                }
                disposables.forEach((d) => d.dispose());
            });

            quickPick.onDidHide(() => {
                disposables.forEach((d) => d.dispose());
                quickPick.dispose();
            });
        };
    }

    /**
     * Set cluster to undefined and remove cluster ID from settings file
     */
    detachClusterCommand() {
        return async () => {
            await this.connectionManager.detachCluster();
        };
    }

    @onError({popup: {prefix: "Error selecting target."}})
    async selectTarget() {
        const targets = await this.configModel.targets;
        const currentTarget = this.configModel.target;
        if (targets === undefined) {
            return;
        }

        const selectedTarget = await window.showQuickPick(
            Object.keys(targets)
                .map((t) => {
                    return {
                        label: t,
                        description: targets[t].mode ?? "dev",
                        detail: targets[t].workspace?.host,
                    };
                })
                .sort((a) => (a.label === currentTarget ? -1 : 1)),
            {title: "Select bundle target"}
        );
        if (selectedTarget === undefined) {
            return;
        }
        try {
            await this.configModel.setTarget(selectedTarget.label);
        } catch (e) {
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error selecting target");
            }
            throw e;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}

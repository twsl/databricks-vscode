import type {ConfigModel} from "../configuration/models/ConfigModel";
import type {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import type {ResolvedEnvironment} from "../language/MsPythonExtensionApi";

// Serverless environment version identifiers.
//
// When adding or updating versions, consult these sources:
// - Version support matrix: https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#versions
//   (mirrored at https://learn.microsoft.com/en-gb/azure/databricks/dev-tools/databricks-connect/requirements#databricks-connect-versions)
// - Serverless environment release notes: https://learn.microsoft.com/en-gb/azure/databricks/release-notes/serverless/environment-version/
// - End-of-support versions: https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#end-of-support-versions
export type ServerlessEnvironmentVersion = "1" | "2" | "3" | "4" | "5";

// Memory sizes for serverless compute.
// Source: https://learn.microsoft.com/en-gb/azure/databricks/compute/configure-serverless#compute-size
export type ServerlessHardwareType = string;

export type ServerlessHardwareOption = {
    id: ServerlessHardwareType;
    label: string;
    detail: string;
    isDefault?: boolean;
};

type ParsedVersion = {
    major: number;
    minor: number;
    patch: number;
};

type SupportedServerlessEnvironmentDefinition = {
    version: ServerlessEnvironmentVersion;
    label: string;
    description: string;
    pythonVersion: `${number}.${number}`;
    databricksConnectLabel: string;
    suggestedDatabricksConnectVersion: string;
    minimumDatabricksConnectVersion: ParsedVersion;
    maximumDatabricksConnectVersionExclusive: ParsedVersion;
};

export type SupportedServerlessEnvironment =
    SupportedServerlessEnvironmentDefinition & {
        detail: string;
    };

export type ResolvedServerlessEnvironment = {
    environment: SupportedServerlessEnvironment;
    hardware: ServerlessHardwareType;
    budgetPolicyId?: string;
    customEnvironmentPath?: string;
    source: "configured" | "detectedDatabricksConnect" | "default";
};

export type UnsupportedServerlessDatabricksConnectReason =
    | "serverlessNotSupported"
    | "noCompatiblePython"
    | "endOfSupport"
    | "unknown";

export type ServerlessDatabricksConnectCompatibility =
    | {
          status: "supported";
          environment: SupportedServerlessEnvironment;
      }
    | {
          status: "unsupported";
          reason: UnsupportedServerlessDatabricksConnectReason;
          upgradeMessage: string;
          environmentVersion?: ServerlessEnvironmentVersion;
          pythonVersion?: `${number}.${number}`;
      };

type ServerlessEnvironmentConfigModel = Pick<ConfigModel, "get" | "set">;
type ServerlessEnvironmentPythonExtension = Pick<
    MsPythonExtensionWrapper,
    "getPackageDetailsFromEnvironment"
>;

type UnsupportedServerlessDatabricksConnectRange = {
    minimumVersion: ParsedVersion;
    maximumVersionExclusive: ParsedVersion;
    reason: UnsupportedServerlessDatabricksConnectReason;
    upgradeMessage: string;
    environmentVersion?: ServerlessEnvironmentVersion;
    pythonVersion?: `${number}.${number}`;
};

const MINIMUM_SERVERLESS_DATABRICKS_CONNECT_VERSION: ParsedVersion = {
    major: 14,
    minor: 3,
    patch: 7,
};

// These definitions combine two documentation sources:
//
// 1. Serverless environment version release notes (version, pythonVersion):
//    https://learn.microsoft.com/en-gb/azure/databricks/release-notes/serverless/environment-version/
//
// 2. Databricks Connect version support matrix (DB Connect ranges, suggestions):
//    https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#versions
//    Mirrored at: https://learn.microsoft.com/en-gb/azure/databricks/dev-tools/databricks-connect/requirements
//
// Environment 1 falls back to the serverless environment release notes because
// it is no longer listed in the current requirements compatibility table.
//
// GPU/AI Runtime environments (available for Environment 4+) are in Public Preview
// and not yet surfaced in this extension. See:
// https://learn.microsoft.com/en-gb/azure/databricks/machine-learning/ai-runtime/
const SERVERLESS_ENVIRONMENT_DEFINITIONS: readonly SupportedServerlessEnvironmentDefinition[] =
    [
        {
            version: "1",
            label: "Standard Environment 1",
            description: "Python 3.10 with Databricks Connect 14.3.7",
            pythonVersion: "3.10",
            databricksConnectLabel: "14.3.7",
            suggestedDatabricksConnectVersion: "14.3.7",
            minimumDatabricksConnectVersion: {major: 14, minor: 3, patch: 7},
            maximumDatabricksConnectVersionExclusive: {
                major: 15,
                minor: 0,
                patch: 0,
            },
        },
        {
            version: "2",
            label: "Standard Environment 2",
            description: "Python 3.11 with Databricks Connect 15.4.x",
            pythonVersion: "3.11",
            databricksConnectLabel: "15.4.x",
            suggestedDatabricksConnectVersion: "15.4.*",
            minimumDatabricksConnectVersion: {major: 15, minor: 4, patch: 10},
            maximumDatabricksConnectVersionExclusive: {
                major: 16,
                minor: 0,
                patch: 0,
            },
        },
        {
            version: "3",
            label: "Standard Environment 3",
            description: "Python 3.12 with Databricks Connect 16.4.x",
            pythonVersion: "3.12",
            databricksConnectLabel: "16.4.x",
            suggestedDatabricksConnectVersion: "16.4.*",
            minimumDatabricksConnectVersion: {major: 16, minor: 4, patch: 1},
            maximumDatabricksConnectVersionExclusive: {
                major: 17,
                minor: 0,
                patch: 0,
            },
        },
        {
            version: "4",
            label: "Standard Environment 4",
            description: "Python 3.12 with Databricks Connect 17.2.x-17.3.x",
            pythonVersion: "3.12",
            databricksConnectLabel: "17.2.x-17.3.x",
            suggestedDatabricksConnectVersion: "17.3.*",
            minimumDatabricksConnectVersion: {major: 17, minor: 2, patch: 0},
            maximumDatabricksConnectVersionExclusive: {
                major: 18,
                minor: 0,
                patch: 0,
            },
        },
        {
            version: "5",
            label: "Standard Environment 5",
            description: "Python 3.12 with Databricks Connect 18.x",
            pythonVersion: "3.12",
            databricksConnectLabel: "18.x",
            suggestedDatabricksConnectVersion: "18.0.*",
            minimumDatabricksConnectVersion: {major: 18, minor: 0, patch: 0},
            maximumDatabricksConnectVersionExclusive: {
                major: 19,
                minor: 0,
                patch: 0,
            },
        },
    ] as const;
function getEnvironmentDetail(
    environment: SupportedServerlessEnvironmentDefinition
) {
    return `${environment.description}${
        environment.version === "5" ? " (recommended)" : ""
    }`;
}

const SUPPORTED_SERVERLESS_ENVIRONMENTS: readonly SupportedServerlessEnvironment[] =
    SERVERLESS_ENVIRONMENT_DEFINITIONS.map((environment) => ({
        ...environment,
        detail: getEnvironmentDetail(environment),
    }));

// Ranges of Databricks Connect versions that have no compatible serverless environment.
// Source: https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#end-of-support-versions
const UNSUPPORTED_SERVERLESS_DATABRICKS_CONNECT_RANGES: readonly UnsupportedServerlessDatabricksConnectRange[] =
    [
        {
            minimumVersion: {major: 15, minor: 1, patch: 0},
            maximumVersionExclusive: {major: 15, minor: 4, patch: 10},
            reason: "noCompatiblePython",
            upgradeMessage:
                "There is no compatible Python version for serverless with Databricks Connect 15.1 to 15.4.9. Upgrade to Databricks Connect 15.4.10 or above.",
        },
        {
            minimumVersion: {major: 16, minor: 0, patch: 0},
            maximumVersionExclusive: {major: 16, minor: 4, patch: 1},
            reason: "noCompatiblePython",
            upgradeMessage:
                "There is no compatible Python version for serverless with Databricks Connect 16.0 to 16.4.0. Upgrade to Databricks Connect 16.4.1 or above.",
        },
        {
            minimumVersion: {major: 17, minor: 0, patch: 0},
            maximumVersionExclusive: {major: 17, minor: 2, patch: 0},
            reason: "endOfSupport",
            environmentVersion: "4",
            pythonVersion: "3.12",
            upgradeMessage:
                "Databricks Connect 17.0 to 17.1 maps to Serverless Environment 4 with Python 3.12, but this range has reached end-of-support. Upgrade to Databricks Connect 17.2 or above.",
        },
    ] as const;

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
    if (left.major !== right.major) {
        return left.major - right.major;
    }
    if (left.minor !== right.minor) {
        return left.minor - right.minor;
    }
    return left.patch - right.patch;
}

// Default hardware options when workspace-specific options are not available.
// Source: https://docs.databricks.com/aws/en/compute/serverless/dependencies#use-high-memory-serverless-compute
const DEFAULT_HARDWARE_OPTIONS: readonly ServerlessHardwareOption[] = [
    {
        id: "standard",
        label: "Standard",
        detail: "16 GB total memory (Public Preview)",
        isDefault: true,
    },
    {
        id: "high",
        label: "High Memory",
        detail: "32 GB total memory (Public Preview)",
    },
];

export class ServerlessEnvironmentService {
    private hardwareOptions: readonly ServerlessHardwareOption[] =
        DEFAULT_HARDWARE_OPTIONS;

    constructor(
        private readonly configModel: ServerlessEnvironmentConfigModel,
        private readonly pythonExtension?: ServerlessEnvironmentPythonExtension
    ) {}

    get supportedEnvironments(): readonly SupportedServerlessEnvironment[] {
        return SUPPORTED_SERVERLESS_ENVIRONMENTS;
    }

    get latestEnvironment(): SupportedServerlessEnvironment {
        return this.getEnvironment("5")!;
    }

    getEnvironment(
        version?: string
    ): SupportedServerlessEnvironment | undefined {
        return this.supportedEnvironments.find(
            (environment) => environment.version === version
        );
    }

    get supportedHardware(): readonly ServerlessHardwareOption[] {
        return this.hardwareOptions;
    }

    setHardwareOptions(options: readonly ServerlessHardwareOption[]) {
        this.hardwareOptions = options;
    }

    get defaultHardware(): ServerlessHardwareOption {
        return (
            this.hardwareOptions.find((h) => h.isDefault) ??
            this.hardwareOptions[0]
        );
    }

    getHardwareOption(id: string): ServerlessHardwareOption | undefined {
        return this.hardwareOptions.find((h) => h.id === id);
    }

    async getConfiguredHardware(): Promise<ServerlessHardwareType> {
        const value = await this.configModel.get("serverlessHardware");
        if (value && this.getHardwareOption(value)) {
            return value;
        }
        return this.defaultHardware.id;
    }

    async setConfiguredHardware(hardware: ServerlessHardwareType) {
        await this.configModel.set("serverlessHardware", hardware);
    }

    async getConfiguredCustomEnvironmentPath(): Promise<string | undefined> {
        return this.configModel.get("serverlessCustomEnvironmentPath");
    }

    async getConfiguredBudgetPolicyId(): Promise<string | undefined> {
        const value = await this.configModel.get("serverlessBudgetPolicyId");
        const trimmed = value?.trim();
        return trimmed ? trimmed : undefined;
    }

    async setConfiguredCustomEnvironmentPath(path?: string) {
        await this.configModel.set("serverlessCustomEnvironmentPath", path);
    }

    async setConfiguredBudgetPolicyId(budgetPolicyId?: string) {
        const trimmed = budgetPolicyId?.trim();
        await this.configModel.set(
            "serverlessBudgetPolicyId",
            trimmed ? trimmed : undefined
        );
    }

    async getConfiguredEnvironment(): Promise<
        SupportedServerlessEnvironment | undefined
    > {
        const version = await this.configModel.get(
            "serverlessEnvironmentVersion"
        );
        if (version === undefined) {
            return undefined;
        }

        return this.getEnvironment(version);
    }

    async setConfiguredEnvironment(version: ServerlessEnvironmentVersion) {
        const environment = this.getEnvironment(version);
        if (!environment) {
            throw new Error(
                `Unsupported serverless environment version: ${version}`
            );
        }

        await this.configModel.set(
            "serverlessEnvironmentVersion",
            environment.version
        );
        // Clear custom environment when selecting a standard version
        await this.setConfiguredCustomEnvironmentPath(undefined);
    }

    async setConfiguredCustomEnvironment(yamlPath: string) {
        await this.configModel.set("serverlessCustomEnvironmentPath", yamlPath);
        // When custom is selected, clear the standard version selection
        await this.configModel.set("serverlessEnvironmentVersion", undefined);
    }

    async getInstalledDatabricksConnectVersion() {
        const packageDetails =
            await this.pythonExtension?.getPackageDetailsFromEnvironment(
                "databricks-connect"
            );
        return packageDetails?.version;
    }

    async detectEnvironmentFromInstalledDatabricksConnect(): Promise<
        SupportedServerlessEnvironment | undefined
    > {
        const version = await this.getInstalledDatabricksConnectVersion();
        return version
            ? this.getEnvironmentForDatabricksConnectVersion(version)
            : undefined;
    }

    async resolveEnvironment(): Promise<ResolvedServerlessEnvironment> {
        const hardware = await this.getConfiguredHardware();
        const budgetPolicyId = await this.getConfiguredBudgetPolicyId();
        const customEnvironmentPath =
            await this.getConfiguredCustomEnvironmentPath();

        if (customEnvironmentPath) {
            return {
                environment: this.latestEnvironment,
                hardware,
                budgetPolicyId,
                customEnvironmentPath,
                source: "configured",
            };
        }

        const configuredEnvironment = await this.getConfiguredEnvironment();
        if (configuredEnvironment) {
            return {
                environment: configuredEnvironment,
                hardware,
                budgetPolicyId,
                source: "configured",
            };
        }

        const detectedEnvironment =
            await this.detectEnvironmentFromInstalledDatabricksConnect();
        if (detectedEnvironment) {
            return {
                environment: detectedEnvironment,
                hardware,
                budgetPolicyId,
                source: "detectedDatabricksConnect",
            };
        }

        return {
            environment: this.latestEnvironment,
            hardware,
            budgetPolicyId,
            source: "default",
        };
    }

    getEnvironmentForDatabricksConnectVersion(version: string) {
        const compatibility = this.getDatabricksConnectCompatibility(version);
        if (compatibility.status !== "supported") {
            return undefined;
        }

        return compatibility.environment;
    }

    getDatabricksConnectCompatibility(
        version: string
    ): ServerlessDatabricksConnectCompatibility {
        const parsedVersion = this.parseDatabricksConnectVersion(version);
        if (!parsedVersion) {
            return {
                status: "unsupported",
                reason: "unknown",
                upgradeMessage: `Databricks Connect ${version} couldn't be mapped to a supported serverless environment version. Upgrade or reinstall Databricks Connect using a supported serverless version.`,
            };
        }

        const supportedEnvironment = SERVERLESS_ENVIRONMENT_DEFINITIONS.map(
            (environment) => this.getEnvironment(environment.version)!
        ).find((environment) =>
            this.isParsedVersionWithinEnvironmentRangeInternal(
                environment,
                parsedVersion
            )
        );
        if (supportedEnvironment) {
            return {
                status: "supported",
                environment: supportedEnvironment,
            };
        }

        if (
            compareVersions(
                parsedVersion,
                MINIMUM_SERVERLESS_DATABRICKS_CONNECT_VERSION
            ) < 0
        ) {
            return {
                status: "unsupported",
                reason: "serverlessNotSupported",
                upgradeMessage: `This extension's supported serverless environment mappings start at Databricks Connect 14.3.7 for Serverless Environment 1. Upgrade Databricks Connect ${version} to 14.3.7 or above.`,
            };
        }

        const unsupportedRange =
            UNSUPPORTED_SERVERLESS_DATABRICKS_CONNECT_RANGES.find((range) =>
                this.isParsedVersionWithinRange(range, parsedVersion)
            );
        if (unsupportedRange) {
            return {
                status: "unsupported",
                reason: unsupportedRange.reason,
                upgradeMessage: unsupportedRange.upgradeMessage,
                environmentVersion: unsupportedRange.environmentVersion,
                pythonVersion: unsupportedRange.pythonVersion,
            };
        }

        return {
            status: "unsupported",
            reason: "unknown",
            upgradeMessage: `Databricks Connect ${version} couldn't be mapped to a supported serverless environment version in this extension. Upgrade or reinstall Databricks Connect using one of the supported serverless mappings.`,
        };
    }

    isDatabricksConnectVersionSupported(
        environment: SupportedServerlessEnvironment,
        version: string
    ) {
        const compatibility = this.getDatabricksConnectCompatibility(version);
        return (
            compatibility.status === "supported" &&
            compatibility.environment.version === environment.version
        );
    }

    private isParsedVersionWithinRange(
        range: UnsupportedServerlessDatabricksConnectRange,
        parsedVersion: ParsedVersion
    ) {
        return (
            compareVersions(parsedVersion, range.minimumVersion) >= 0 &&
            compareVersions(parsedVersion, range.maximumVersionExclusive) < 0
        );
    }

    isPythonEnvironmentCompatible(
        environment: SupportedServerlessEnvironment,
        pythonEnvironment?: ResolvedEnvironment
    ) {
        const [expectedMajor, expectedMinor] = environment.pythonVersion
            .split(".")
            .map((part) => parseInt(part, 10));

        return (
            pythonEnvironment?.version?.major === expectedMajor &&
            pythonEnvironment?.version?.minor === expectedMinor
        );
    }

    parseDatabricksConnectVersion(version: string): ParsedVersion | undefined {
        const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!match) {
            return undefined;
        }

        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3] ?? "0", 10),
        };
    }

    private isParsedVersionWithinEnvironmentRangeInternal(
        environment: SupportedServerlessEnvironment,
        parsedVersion: ParsedVersion
    ): boolean {
        return (
            compareVersions(
                parsedVersion,
                environment.minimumDatabricksConnectVersion
            ) >= 0 &&
            compareVersions(
                parsedVersion,
                environment.maximumDatabricksConnectVersionExclusive
            ) < 0
        );
    }
}

import assert from "assert";
import {ServerlessEnvironmentService} from "./ServerlessEnvironmentService";

describe(__filename, () => {
    let installedDatabricksConnectVersion: string | undefined;
    let configState: Record<string, string | undefined>;
    let service: ServerlessEnvironmentService;

    beforeEach(() => {
        installedDatabricksConnectVersion = undefined;
        configState = {};
        service = new ServerlessEnvironmentService(
            {
                get: async (key: unknown) => {
                    return configState[key as string];
                },
                set: async (key: unknown, value: unknown) => {
                    configState[key as string] = value as string | undefined;
                },
            } as any,
            {
                getPackageDetailsFromEnvironment: async () =>
                    installedDatabricksConnectVersion
                        ? ({
                              version: installedDatabricksConnectVersion,
                          } as any)
                        : undefined,
            } as any
        );
    });

    it("prefers configured environment over detected databricks-connect", async () => {
        configState.serverlessEnvironmentVersion = "4";
        installedDatabricksConnectVersion = "18.0.5";

        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.environment.version, "4");
        assert.equal(resolved.source, "configured");
    });

    it("detects the matching environment from databricks-connect version", async () => {
        installedDatabricksConnectVersion = "16.4.12";

        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.environment.version, "3");
        assert.equal(resolved.source, "detectedDatabricksConnect");
    });

    it("detects environment 1 from databricks-connect 14.3.7", async () => {
        installedDatabricksConnectVersion = "14.3.7";

        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.environment.version, "1");
        assert.equal(resolved.environment.pythonVersion, "3.10");
        assert.equal(resolved.source, "detectedDatabricksConnect");
    });

    it("falls back to the latest environment when no supported version is detected", async () => {
        installedDatabricksConnectVersion = "15.1.0";

        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.environment.version, "5");
        assert.equal(resolved.source, "default");
    });

    it("includes hardware in resolved environment", async () => {
        configState.serverlessHardware = "high";
        configState.serverlessEnvironmentVersion = "5";

        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.hardware, "high");
        assert.equal(resolved.environment.version, "5");
        assert.equal(resolved.source, "configured");
    });

    it("defaults hardware to standard", async () => {
        const resolved = await service.resolveEnvironment();

        assert.equal(resolved.hardware, "standard");
    });

    it("resolves custom environment when path is configured", async () => {
        configState.serverlessCustomEnvironmentPath =
            "/Workspace/environments/custom.yml";

        const resolved = await service.resolveEnvironment();

        assert.equal(
            resolved.customEnvironmentPath,
            "/Workspace/environments/custom.yml"
        );
        assert.equal(resolved.source, "configured");
        // Falls back to latest environment for version metadata
        assert.equal(resolved.environment.version, "5");
    });

    it("checks python minor version compatibility", () => {
        const environment = service.getEnvironment("5");
        assert.ok(environment);
        assert.equal(
            service.isPythonEnvironmentCompatible(environment!, {
                environment: {name: ".venv"} as any,
                version: {major: 3, minor: 12, micro: 3},
            } as any),
            true
        );
        assert.equal(
            service.isPythonEnvironmentCompatible(environment!, {
                environment: {name: ".venv"} as any,
                version: {major: 3, minor: 11, micro: 9},
            } as any),
            false
        );
    });

    it("marks 15.1 to 15.4.9 as unsupported for serverless due to missing Python mapping", () => {
        const compatibility =
            service.getDatabricksConnectCompatibility("15.4.9");

        assert.equal(compatibility.status, "unsupported");
        if (compatibility.status === "unsupported") {
            assert.equal(compatibility.reason, "noCompatiblePython");
            assert.match(compatibility.upgradeMessage, /15\.4\.10 or above/);
        }
    });

    it("marks 16.0 to 16.4.0 as unsupported for serverless due to missing Python mapping", () => {
        const compatibility =
            service.getDatabricksConnectCompatibility("16.4.0");

        assert.equal(compatibility.status, "unsupported");
        if (compatibility.status === "unsupported") {
            assert.equal(compatibility.reason, "noCompatiblePython");
            assert.match(compatibility.upgradeMessage, /16\.4\.1 or above/);
        }
    });

    it("marks 17.0 to 17.1 as end-of-support for serverless environment 4", () => {
        const compatibility =
            service.getDatabricksConnectCompatibility("17.1.0");

        assert.equal(compatibility.status, "unsupported");
        if (compatibility.status === "unsupported") {
            assert.equal(compatibility.reason, "endOfSupport");
            assert.equal(compatibility.environmentVersion, "4");
            assert.equal(compatibility.pythonVersion, "3.12");
            assert.match(compatibility.upgradeMessage, /17\.2 or above/);
        }
    });

    it("treats versions below 14.3.7 as lacking a supported serverless mapping", () => {
        const compatibility =
            service.getDatabricksConnectCompatibility("14.2.0");

        assert.equal(compatibility.status, "unsupported");
        if (compatibility.status === "unsupported") {
            assert.equal(compatibility.reason, "serverlessNotSupported");
            assert.match(
                compatibility.upgradeMessage,
                /start at Databricks Connect 14\.3\.7/
            );
        }
    });

    it("returns the environment 1 definition", () => {
        const environment = service.getEnvironment("1");

        assert.ok(environment);
        assert.equal(environment?.label, "Standard Environment 1");
        assert.equal(environment?.pythonVersion, "3.10");
        assert.equal(environment?.suggestedDatabricksConnectVersion, "14.3.7");
    });

    it("persists hardware through the config model", async () => {
        await service.setConfiguredHardware("high");

        assert.equal(configState.serverlessHardware, "high");

        const hw = await service.getConfiguredHardware();
        assert.equal(hw, "high");
    });

    it("persists custom environment path through the config model", async () => {
        await service.setConfiguredCustomEnvironment(
            "/Workspace/environments/custom.yml"
        );

        assert.equal(
            configState.serverlessCustomEnvironmentPath,
            "/Workspace/environments/custom.yml"
        );
        // Standard version should be cleared when custom is selected
        assert.equal(configState.serverlessEnvironmentVersion, undefined);
    });

    it("clears custom environment when selecting a standard version", async () => {
        configState.serverlessCustomEnvironmentPath =
            "/Workspace/environments/custom.yml";

        await service.setConfiguredEnvironment("5");

        assert.equal(configState.serverlessEnvironmentVersion, "5");
        assert.equal(configState.serverlessCustomEnvironmentPath, undefined);
    });

    it("returns default supported hardware options", () => {
        const hardware = service.supportedHardware;

        assert.ok(hardware.length >= 2);
        assert.equal(hardware[0].id, "standard");
        assert.equal(hardware[1].id, "high");
    });

    it("allows overriding hardware options via setHardwareOptions", async () => {
        service.setHardwareOptions([
            {id: "small", label: "Small", detail: "8 GB", isDefault: true},
            {id: "large", label: "Large", detail: "64 GB"},
        ]);

        const hardware = service.supportedHardware;
        assert.equal(hardware.length, 2);
        assert.equal(hardware[0].id, "small");
        assert.equal(service.defaultHardware.id, "small");
    });

    it("falls back to default hardware when configured value is unknown", async () => {
        configState.serverlessHardware = "nonexistent";

        const hw = await service.getConfiguredHardware();
        assert.equal(hw, "standard");
    });
});

import assert from "assert";
import {SubmitRun} from "@databricks/sdk-experimental/dist/apis/jobs";
import {WorkflowRun} from "./WorkflowRun";

describe(__filename, () => {
    it("submits environment_version for serverless python runs", async () => {
        const originalSubmitRun = WorkflowRun.submitRun;
        let capturedRequest: SubmitRun | undefined;

        (WorkflowRun as any).submitRun = async (
            _client: unknown,
            submitRunRequest: SubmitRun
        ) => {
            capturedRequest = submitRunRequest;
            return {
                wait: async () => {},
                getOutput: async () => ({logs: "hello"}),
                lifeCycleState: "TERMINATED",
            };
        };

        try {
            const output = await WorkflowRun.runPythonAndWait({
                client: {} as any,
                path: "/Workspace/main.py",
                environmentVersion: "4",
            });

            assert.equal(output.logs, "hello");
            assert.deepEqual(capturedRequest?.environments, [
                {
                    environment_key: "js_sdk_job_run_environment",
                    spec: {environment_version: "4"},
                },
            ]);
            assert.equal(
                (capturedRequest?.tasks?.[0] as any)?.environment_key,
                "js_sdk_job_run_environment"
            );
        } finally {
            (WorkflowRun as any).submitRun = originalSubmitRun;
        }
    });

    it("includes custom environment path and dependencies in spec", async () => {
        const originalSubmitRun = WorkflowRun.submitRun;
        let capturedRequest: SubmitRun | undefined;

        (WorkflowRun as any).submitRun = async (
            _client: unknown,
            submitRunRequest: SubmitRun
        ) => {
            capturedRequest = submitRunRequest;
            return {
                wait: async () => {},
                getOutput: async () => ({logs: "hello"}),
                lifeCycleState: "TERMINATED",
            };
        };

        try {
            await WorkflowRun.runPythonAndWait({
                client: {} as any,
                path: "/Workspace/main.py",
                environmentVersion: "5",
                customEnvironmentPath: "/Workspace/environments/custom.yml",
                dependencies: ["pandas==2.0.0", "numpy"],
            });

            const spec = (capturedRequest?.environments?.[0] as any)?.spec;
            assert.equal(spec.environment_version, "5");
            assert.equal(spec.client, "/Workspace/environments/custom.yml");
            assert.deepEqual(spec.dependencies, ["pandas==2.0.0", "numpy"]);
        } finally {
            (WorkflowRun as any).submitRun = originalSubmitRun;
        }
    });

    it("does not send serverless environment settings for cluster runs", async () => {
        const originalSubmitRun = WorkflowRun.submitRun;
        let capturedRequest: SubmitRun | undefined;

        (WorkflowRun as any).submitRun = async (
            _client: unknown,
            submitRunRequest: SubmitRun
        ) => {
            capturedRequest = submitRunRequest;
            return {
                wait: async () => {},
                getOutput: async () => ({logs: "hello"}),
                lifeCycleState: "TERMINATED",
            };
        };

        try {
            await WorkflowRun.runPythonAndWait({
                client: {} as any,
                clusterId: "cluster-123",
                path: "/Workspace/main.py",
                environmentVersion: "5",
            });

            assert.equal(capturedRequest?.environments, undefined);
            assert.equal(
                (capturedRequest?.tasks?.[0] as any)?.existing_cluster_id,
                "cluster-123"
            );
        } finally {
            (WorkflowRun as any).submitRun = originalSubmitRun;
        }
    });
});

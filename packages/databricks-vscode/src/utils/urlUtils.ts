import {env, Uri} from "vscode";

export function addHttpsIfNoProtocol(url: string) {
    return `${url}`.startsWith("http") ? `${url}` : `https://${url}`;
}
export async function openExternal(url: string) {
    await env.openExternal(Uri.parse(addHttpsIfNoProtocol(url), true));
}

export class UrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UrlError";
    }
}

export function normalizeHost(host: string): URL {
    let url: URL;

    if (!host.startsWith("http")) {
        host = `https://${host}`;
    }
    try {
        url = new URL(host);
    } catch (e) {
        throw new UrlError("Invalid host name");
    }
    if (url.protocol !== "https:") {
        throw new UrlError("Invalid protocol");
    }

    return new URL(`https://${url.hostname}`);
}

export function isAzureHost(url: URL): boolean {
    return !!url.hostname.match(
        /(\.databricks\.azure\.us|\.databricks\.azure\.cn|\.azuredatabricks\.net)$/
    );
}

export function isGcpHost(url: URL): boolean {
    return !!url.hostname.match(/\.gcp\.databricks\.com$/);
}

export function isAwsHost(url: URL): boolean {
    return !!url.hostname.match(
        /(\.cloud\.databricks\.com|\.dev\.databricks\.com)$/
    );
}

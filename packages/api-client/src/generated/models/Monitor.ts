/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Monitor = {
    id: number;
    label?: string | null;
    method: string;
    url: string;
    iconUrl: string;
    body?: string | null;
    headers?: Record<string, string>;
    auth?: Record<string, string>;
    notificationChannels?: Array<'telegram'>;
    selector?: string | null;
    expectedType: Monitor.expectedType;
    expectedResponse?: string | null;
    cron: string;
    enabled: boolean;
    status: Monitor.status;
    checkCount: number;
    nextRunAt?: string | null;
    lastCheckAt?: string | null;
    lastSuccessAt?: string | null;
    lastErrorAt?: string | null;
    lastStatusCode?: number | null;
    lastDurationMs?: number | null;
    lastErrorMessage?: string | null;
    createdAt: string;
    updatedAt: string;
};
export namespace Monitor {
    export enum expectedType {
        JSON = 'json',
        HTML = 'html',
        TEXT = 'text',
    }
    export enum status {
        PENDING = 'pending',
        OK = 'ok',
        ERROR = 'error',
        RETRYING = 'retrying',
        DISABLED = 'disabled',
    }
}


/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MonitorCheck = {
    id: number;
    status: MonitorCheck.status;
    statusCode?: number | null;
    responseTimeMs?: number | null;
    errorMessage?: string | null;
    selectionType?: string | null;
    selectionValue?: string | null;
    diffChanged?: boolean;
    diffKind?: string | null;
    diffSummary?: string | null;
    diffDetails?: string | null;
    checkedAt: string;
};
export namespace MonitorCheck {
    export enum status {
        OK = 'ok',
        ERROR = 'error',
        RETRYING = 'retrying',
        PENDING = 'pending',
        UNKNOWN = 'unknown',
    }
}


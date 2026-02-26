/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateMonitorRequest = {
    label?: string;
    method?: string;
    url: string;
    iconUrl?: string;
    body?: string;
    headers?: Record<string, string>;
    auth?: Record<string, string>;
    notificationChannels?: Array<'telegram'>;
    selector?: string;
    expectedType?: CreateMonitorRequest.expectedType;
    expectedResponse?: string;
    cron: string;
    enabled?: boolean;
};
export namespace CreateMonitorRequest {
    export enum expectedType {
        JSON = 'json',
        HTML = 'html',
        TEXT = 'text',
    }
}


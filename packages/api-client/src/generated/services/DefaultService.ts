/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateMonitorRequest } from '../models/CreateMonitorRequest';
import type { HealthResponse } from '../models/HealthResponse';
import type { Monitor } from '../models/Monitor';
import type { MonitorCheck } from '../models/MonitorCheck';
import type { MonitorTriggerResult } from '../models/MonitorTriggerResult';
import type { RuntimeSettings } from '../models/RuntimeSettings';
import type { SelectorPreviewRequest } from '../models/SelectorPreviewRequest';
import type { SelectorPreviewResponse } from '../models/SelectorPreviewResponse';
import type { TelegramSettings } from '../models/TelegramSettings';
import type { TestMonitorRequest } from '../models/TestMonitorRequest';
import type { TestMonitorResponse } from '../models/TestMonitorResponse';
import type { TestTelegramSettingsRequest } from '../models/TestTelegramSettingsRequest';
import type { TestTelegramSettingsResponse } from '../models/TestTelegramSettingsResponse';
import type { UpsertRuntimeSettingsRequest } from '../models/UpsertRuntimeSettingsRequest';
import type { UpsertTelegramSettingsRequest } from '../models/UpsertTelegramSettingsRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Health check
     * @returns HealthResponse API is healthy
     * @throws ApiError
     */
    public static getHealth(): CancelablePromise<HealthResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/healthz',
        });
    }
    /**
     * List configured monitors
     * @returns Monitor Current monitors
     * @throws ApiError
     */
    public static listMonitors(): CancelablePromise<Array<Monitor>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v1/monitors',
        });
    }
    /**
     * Create monitor
     * @returns MonitorTriggerResult Monitor created
     * @throws ApiError
     */
    public static createMonitor({
        requestBody,
    }: {
        requestBody: CreateMonitorRequest,
    }): CancelablePromise<MonitorTriggerResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/monitors',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
    /**
     * Delete monitor
     * @returns void
     * @throws ApiError
     */
    public static deleteMonitor({
        monitorId,
    }: {
        monitorId: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v1/monitors/{monitorId}',
            path: {
                'monitorId': monitorId,
            },
            errors: {
                404: `Monitor not found`,
            },
        });
    }
    /**
     * Update monitor
     * @returns Monitor Monitor updated
     * @throws ApiError
     */
    public static updateMonitor({
        monitorId,
        requestBody,
    }: {
        monitorId: number,
        requestBody: CreateMonitorRequest,
    }): CancelablePromise<Monitor> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/v1/monitors/{monitorId}',
            path: {
                'monitorId': monitorId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
                404: `Monitor not found`,
            },
        });
    }
    /**
     * Trigger monitor to run immediately
     * @returns MonitorTriggerResult Monitor trigger completed
     * @throws ApiError
     */
    public static triggerMonitor({
        monitorId,
    }: {
        monitorId: number,
    }): CancelablePromise<MonitorTriggerResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/monitors/{monitorId}/trigger',
            path: {
                'monitorId': monitorId,
            },
            errors: {
                400: `Monitor cannot be triggered`,
                404: `Monitor not found`,
            },
        });
    }
    /**
     * Test monitor URL via backend
     * @returns TestMonitorResponse Test response from target URL
     * @throws ApiError
     */
    public static testMonitorUrl({
        requestBody,
    }: {
        requestBody: TestMonitorRequest,
    }): CancelablePromise<TestMonitorResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/monitors/test',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
    /**
     * Preview a gjson selector against JSON
     * @returns SelectorPreviewResponse Selector evaluation output
     * @throws ApiError
     */
    public static previewMonitorSelector({
        requestBody,
    }: {
        requestBody: SelectorPreviewRequest,
    }): CancelablePromise<SelectorPreviewResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/monitors/selector-preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
    /**
     * Get Telegram notification channel settings
     * @returns TelegramSettings Telegram channel settings
     * @throws ApiError
     */
    public static getTelegramSettings(): CancelablePromise<TelegramSettings> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v1/settings/notifications/telegram',
        });
    }
    /**
     * Create or update Telegram notification channel settings
     * @returns TelegramSettings Updated Telegram channel settings
     * @throws ApiError
     */
    public static upsertTelegramSettings({
        requestBody,
    }: {
        requestBody: UpsertTelegramSettingsRequest,
    }): CancelablePromise<TelegramSettings> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/v1/settings/notifications/telegram',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
    /**
     * Send a test Telegram notification
     * @returns TestTelegramSettingsResponse Test message was sent
     * @throws ApiError
     */
    public static testTelegramSettings({
        requestBody,
    }: {
        requestBody: TestTelegramSettingsRequest,
    }): CancelablePromise<TestTelegramSettingsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/settings/notifications/telegram/test',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
                502: `Failed to send Telegram message`,
            },
        });
    }
    /**
     * Get global runtime settings
     * @returns RuntimeSettings Runtime settings
     * @throws ApiError
     */
    public static getRuntimeSettings(): CancelablePromise<RuntimeSettings> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v1/settings/runtime',
        });
    }
    /**
     * Update global runtime settings
     * @returns RuntimeSettings Updated runtime settings
     * @throws ApiError
     */
    public static upsertRuntimeSettings({
        requestBody,
    }: {
        requestBody: UpsertRuntimeSettingsRequest,
    }): CancelablePromise<RuntimeSettings> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/v1/settings/runtime',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
    /**
     * List recent checks for a monitor
     * @returns MonitorCheck Recent checks for the monitor
     * @throws ApiError
     */
    public static listMonitorChecks({
        monitorId,
        limit = 20,
    }: {
        monitorId: number,
        limit?: number,
    }): CancelablePromise<Array<MonitorCheck>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v1/monitors/{monitorId}/checks',
            path: {
                'monitorId': monitorId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                404: `Monitor not found`,
            },
        });
    }
}

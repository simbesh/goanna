/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateEndpointRequest } from '../models/CreateEndpointRequest';
import type { Endpoint } from '../models/Endpoint';
import type { HealthResponse } from '../models/HealthResponse';
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
     * List monitored endpoints
     * @returns Endpoint Current endpoints
     * @throws ApiError
     */
    public static listEndpoints(): CancelablePromise<Array<Endpoint>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v1/endpoints',
        });
    }
    /**
     * Create monitored endpoint
     * @returns Endpoint Endpoint created
     * @throws ApiError
     */
    public static createEndpoint({
        requestBody,
    }: {
        requestBody: CreateEndpointRequest,
    }): CancelablePromise<Endpoint> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v1/endpoints',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body`,
            },
        });
    }
}

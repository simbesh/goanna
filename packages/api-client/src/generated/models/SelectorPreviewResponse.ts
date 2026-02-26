/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SelectorPreviewResponse = {
    exists: boolean;
    /**
     * one of none, null, false, number, string, true, json.
     */
    type: string;
    /**
     * Raw selected value as JSON text.
     */
    raw?: string | null;
    /**
     * Normalized value used for monitor expectedResponse comparison.
     */
    value?: string | null;
};


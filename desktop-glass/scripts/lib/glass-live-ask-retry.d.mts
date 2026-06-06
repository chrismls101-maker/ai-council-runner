export declare function isTransientLiveAskError(err: unknown, httpStatus?: number): boolean;
export declare function isNonRetryableLiveAskFailure(err: unknown, httpStatus?: number): boolean;
export declare function shouldRetryLiveAsk(err: unknown, httpStatus?: number, attempt?: number): boolean;

export type ActionExecutionStatus = 'SUCCESS' | 'REJECTED' | 'ERROR';

export type ActionComplete = (
  executionStatus: ActionExecutionStatus,
  result: string,
  auditedData?: any,
  errorMessage?: string
) => Promise<string>;

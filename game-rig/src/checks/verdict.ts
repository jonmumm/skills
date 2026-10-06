export type Verdict<F> = { pass: boolean; failures: F[] };
export const verdict = <F>(failures: F[]): Verdict<F> => ({ pass: failures.length === 0, failures });

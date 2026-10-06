export type empty_boolean = boolean | null;

export interface MainProps {
  first_time: boolean;
  onOnboardingComplete?: () => void;
}


export const FIRST_TIME_KEY = 'first_time' as const;
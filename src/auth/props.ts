export type GoogleProps = {
  sub: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export function isGoogleProps(value: unknown): value is GoogleProps {
  if (typeof value !== "object" || value === null) return false;
  const props = value as Partial<GoogleProps>;
  return (
    typeof props.sub === "string" &&
    typeof props.email === "string" &&
    typeof props.accessToken === "string" &&
    typeof props.refreshToken === "string" &&
    typeof props.expiresAt === "number"
  );
}

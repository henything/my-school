export function publicOriginFromRequest(request: Request) {
  const configuredOrigin = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  const requestUrl = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host") ?? requestUrl.host;
  const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.replace(":", "");

  return `${proto}://${host}`;
}

export function buildTokenUrl(request: Request, pathname: string, token: string) {
  const url = new URL(pathname, publicOriginFromRequest(request));
  url.searchParams.set("token", token);
  return url.toString();
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

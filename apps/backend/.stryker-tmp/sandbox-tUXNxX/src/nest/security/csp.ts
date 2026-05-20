// @ts-nocheck
export function buildCspDirectivesFromEnv() {
  const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const withSelf = (arr: string[]) => ["'self'", ...arr.filter((x) => x !== "'self'")];

  const connect = withSelf(list(process.env.CSP_CONNECT_SRC));
  const script = withSelf(list(process.env.CSP_SCRIPT_SRC));
  const img = withSelf([...(list(process.env.CSP_IMG_SRC) || []), 'data:', 'https:']);
  const media = withSelf([...(list(process.env.CSP_MEDIA_SRC) || []), 'https:']);
  const styleList = list(process.env.CSP_STYLE_SRC);
  const style = styleList.length ? withSelf(styleList) : ["'unsafe-inline'"];
  const reportEndpoint = process.env.CSP_REPORT_ENDPOINT || '/csp-report';

  return {
    defaultSrc: ["'self'"],
    connectSrc: connect,
    scriptSrc: script,
    imgSrc: img,
    mediaSrc: media,
    styleSrc: style,
    frameAncestors: ["'none'"],
    // helmet accepts reportUri as string
    reportUri: reportEndpoint,
  };
}


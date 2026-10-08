import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

export type AccessConfig = {
  teamDomain: string; // ex.: "meuclube.cloudflareaccess.com"
  aud: string; // "Application Audience (AUD) Tag" da aplicação no Access
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

const remoteJwks = (teamDomain: string) => {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
};

/**
 * Valida o JWT que o Cloudflare Access coloca em cada requisição e devolve o
 * email autenticado, ou null se o token for inválido.
 */
export const verifyAccessJwt = async (
  token: string,
  config: AccessConfig,
  jwks: JWTVerifyGetKey = remoteJwks(config.teamDomain),
): Promise<string | null> => {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
    });
    // Tokens de serviço não têm email; só aceitamos pessoas.
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
};

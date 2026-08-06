/**
 * swagger-ui-dist ships no types. Rather than take on @types/swagger-ui-dist
 * (which describes the whole plugin system), this declares exactly the surface
 * the API docs page uses — extend it if that page starts using more.
 */
declare module "swagger-ui-dist/swagger-ui-es-bundle.js" {
  type SwaggerUIConfig = {
    url?: string;
    spec?: object;
    domNode?: HTMLElement | null;
    dom_id?: string;
    presets?: unknown[];
    layout?: string;
    docExpansion?: "list" | "full" | "none";
    filter?: boolean | string;
    persistAuthorization?: boolean;
    tryItOutEnabled?: boolean;
    defaultModelsExpandDepth?: number;
    defaultModelExpandDepth?: number;
    onComplete?: () => void;
  };

  interface SwaggerUIBundleStatic {
    (config: SwaggerUIConfig): unknown;
    presets: { apis: unknown };
  }

  const SwaggerUIBundle: SwaggerUIBundleStatic;
  export default SwaggerUIBundle;
}

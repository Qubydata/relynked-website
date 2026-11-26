/** relynked.com/api/beta/settings: the pay, sprint and spots the beta page shows, from the API (./_proxy.js). */
import { toBetaApi } from "./_proxy.js";

export const onRequestGet = (context) => toBetaApi(context, "/beta/settings");

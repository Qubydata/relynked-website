/** relynked.com/api/waitlist/status: whether the waitlist is open (the API's WAITLIST_OPEN), through ../beta/_proxy.js. */
import { toBetaApi } from "../beta/_proxy.js";

export const onRequestGet = (context) => toBetaApi(context, "/waitlist/status");

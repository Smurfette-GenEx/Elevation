import { api, parseJson } from "@/server/http/handler";
import { tripSchema } from "@/server/validation";
import { createTrip, listTrips } from "@/server/services/advance-service";

export const GET = api(async ({ actor }) => listTrips(actor));
export const POST = api(async ({ req, actor }) => createTrip(actor, await parseJson(req, tripSchema)));

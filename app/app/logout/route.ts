import { logoutAction } from "../actions";

export async function POST() {
  await logoutAction();
}

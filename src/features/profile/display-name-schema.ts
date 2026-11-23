import { z } from "@/lib/zod";
import { DISPLAY_NAME_LENGTH } from "@/lib/messages";

export const displayNameSchema = z.object({
  displayName: z.string().trim().min(3, DISPLAY_NAME_LENGTH).max(30, DISPLAY_NAME_LENGTH),
});
export type DisplayNameValues = z.infer<typeof displayNameSchema>;

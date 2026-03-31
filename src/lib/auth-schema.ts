import { z } from "zod";

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

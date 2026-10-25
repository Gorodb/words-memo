import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 6;

export class CredentialsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `The password needs at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  @MaxLength(200)
  password: string;
}

export interface AuthResponse {
  /** Bearer token; it never expires (logout revokes it). */
  token: string;
  user: { id: string; email: string };
}

import { IsOptional, IsString } from 'class-validator';

export class UpsertProfileDto {
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() skinType?: string;
  @IsOptional() @IsString() conditions?: string;
  @IsOptional() @IsString() medications?: string;
  @IsOptional() @IsString() notes?: string;
}

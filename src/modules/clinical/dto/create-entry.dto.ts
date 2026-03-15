import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateEntryDto {
  @IsString() @IsNotEmpty() treatment: string;
  @IsOptional() @IsString() products?: string;
  @IsOptional() @IsString() technique?: string;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsString() nextVisitNotes?: string;
  @IsOptional() @IsDateString() date?: string;
}

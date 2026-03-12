import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class UpsertClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Phone used for WhatsApp (E.164 without +, e.g. 56951209722) */
  @IsString()
  @IsNotEmpty()
  waPhone: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyStamps?: number;
}

import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  IsNotEmpty,
  IsDateString,
  Matches,
} from 'class-validator';

export class UpsertClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Phone used for WhatsApp (digits only, no +, e.g. 56951209722) */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,15}$/, { message: 'waPhone must be 7-15 digits without + prefix' })
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

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}

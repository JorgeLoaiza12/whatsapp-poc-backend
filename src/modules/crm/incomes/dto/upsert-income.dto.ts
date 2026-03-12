import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertIncomeDto {
  @IsString()
  @IsNotEmpty()
  contactId: string;

  /** Comma-separated service names */
  @IsString()
  @IsNotEmpty()
  serviceNames: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsString()
  @IsIn(['CLP', 'USD', 'VES'])
  currency: string;

  @IsString()
  @IsIn(['Efectivo', 'Transferencia', 'Tarjeta'])
  paymentMethod: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

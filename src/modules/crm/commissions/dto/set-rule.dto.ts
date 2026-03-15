import { IsNumber, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SetRuleDto {
  @IsString()
  userId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;
}

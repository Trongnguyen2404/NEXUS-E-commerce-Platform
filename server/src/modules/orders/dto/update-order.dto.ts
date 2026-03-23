import { IsEnum, IsOptional, IsString } from "class-validator";
import { OrderStatus } from "./query-order.dto";

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
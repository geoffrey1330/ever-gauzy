import { Column, OneToMany } from 'typeorm';
import { ProductTypesIconsEnum } from '@gauzy/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
	Product,
	ProductTypeTranslation,
	TranslatableBase
} from '../core/entities/internal';
import { MultiORMEntity } from './../core/decorators/entity';
import { MikroOrmProductTypeRepository } from './repository/mikro-orm-product-type.repository';

@MultiORMEntity('product_type', { mikroOrmRepository: () => MikroOrmProductTypeRepository })
export class ProductType extends TranslatableBase {

	@ApiProperty({ type: () => String, enum: ProductTypesIconsEnum })
	@Column({ nullable: true })
	icon: string;

	/*
	|--------------------------------------------------------------------------
	| @OneToMany
	|--------------------------------------------------------------------------
	*/

	/**
	 * Product
	 */
	@ApiProperty({ type: () => Product, isArray: true })
	@OneToMany(() => Product, (product) => product.productType)
	products: Product[];

	/**
	 * ProductTypeTranslation
	 */
	@ApiProperty({ type: () => ProductTypeTranslation, isArray: true })
	@OneToMany(() => ProductTypeTranslation, (productTypeTranslation) => productTypeTranslation.reference, {
		/** Eager relations are always loaded automatically when relation's owner entity is loaded using find* methods. */
		eager: true,

		/** Database cascade actions. */
		cascade: true
	})
	translations: ProductTypeTranslation[];
}

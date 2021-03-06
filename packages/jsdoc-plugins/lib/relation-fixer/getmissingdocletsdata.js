/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * Licensed under the terms of the MIT License (see LICENSE.md).
 */

'use strict';

const { cloneDeep } = require( 'lodash' );

module.exports = getMissingDocletsData;

/**
 * Gets missing doclets of members coming from implemented interfaces, extended classes, mixins and typedefs.
 * It returns also doclets which should be ignored as no longer necessary.
 * This function requires input to be preprocessed by the `buildRelations()` function.
 *
 * @param {DocletCollection} docletCollection
 * @param {Doclet} interfaceClassOrMixinDoclet Doclet representing an entity which might have some inherited members missing.
 * @param {Options} options
 * @returns {{newDoclets: Array.<Doclet>, docletsWhichShouldBeIgnored: Array.<Doclet>}}
 */
function getMissingDocletsData( docletCollection, interfaceClassOrMixinDoclet, options ) {
	const newDoclets = [];
	const docletsWhichShouldBeIgnored = [];

	const docletsToAdd = getDocletsToAdd( docletCollection, interfaceClassOrMixinDoclet, options );
	const docletMap = createDocletMap( docletCollection );

	for ( const docletToAdd of docletsToAdd ) {
		const clonedDoclet = cloneDeep( docletToAdd );

		clonedDoclet.longname = getLongnameForNewDoclet( docletToAdd, interfaceClassOrMixinDoclet );
		clonedDoclet.memberof = interfaceClassOrMixinDoclet.longname;

		// Add property `inherited` or `mixed`.
		const relationProperty = getRelationProperty( docletMap, interfaceClassOrMixinDoclet, docletToAdd, options.relation );

		if ( relationProperty ) {
			clonedDoclet[ relationProperty ] = true;
		}

		const docletsOfSameMember = docletCollection.get( `memberof:${ clonedDoclet.memberof }` ).filter( d => {
			return d.name === clonedDoclet.name && d.kind === clonedDoclet.kind;
		} );

		if ( docletsOfSameMember.length === 0 ) {
			// If there was no doclet for that member, simply add it to new doclets.
			newDoclets.push( clonedDoclet );
		} else if ( doAllParentsExplicitlyInherit( docletsOfSameMember ) && !options.onlyImplicitlyInherited ) {
			// If all doclets in the chain for that member already existed and used `inheritdoc` or `overrides`.
			// Add `ignore` property to existing doclets. Unless 'onlyImplicitlyInherited' option is set.
			docletsWhichShouldBeIgnored.push( ...docletsOfSameMember );

			newDoclets.push( clonedDoclet );
		} else if ( docletsOfSameMember.length >= 2 ) {
			const correctDoclet = cloneDeep( docletsOfSameMember[ 0 ] );

			correctDoclet[ relationProperty ] = true;

			docletsWhichShouldBeIgnored.push( ...docletsOfSameMember );
			newDoclets.push( correctDoclet );
		}
	}

	return {
		newDoclets,
		docletsWhichShouldBeIgnored
	};
}

/**
 * Gets doclets from entities related to current doclet (e.g. implemented by it)
 * and matching criteria given via the `options.filter` query.
 *
 * @param {DocletCollection} docletCollection
 * @param {Doclet} childDoclet
 * @param {Options} options
 */
function getDocletsToAdd( docletCollection, childDoclet, options ) {
	// Longnames of doclets which are related ( extended, mixed, implemented ) to childDoclet.
	const ancestors = childDoclet[ options.relation ] || [];

	return ancestors.reduce( ( docletsToAdd, longname ) => {
		return [
			...docletsToAdd,
			...docletCollection.get( `memberof:${ longname }` ).filter( shouldDocletBeAdded )
		];
	}, [] );

	/** @param {Doclet} doclet */
	function shouldDocletBeAdded( doclet ) {
		// Filter out ignored, inherited, undocumented.
		if (
			doclet.ignore ||
			doclet.undocumented ||
			typeof doclet.inheritdoc == 'string'
		) {
			return false;
		}

		for ( const key of Object.keys( options.filter || {} ) ) {
			if ( doclet[ key ] !== options.filter[ key ] ) {
				return false;
			}
		}

		return true;
	}
}

function isNonEmptyArray( obj ) {
	return Array.isArray( obj ) && obj.length > 0;
}

/**
 * @param {Doclet} parentDoclet
 * @param {Doclet} childDoclet
 * @returns {String}
 */
function getLongnameForNewDoclet( parentDoclet, childDoclet ) {
	const dotIndex = parentDoclet.longname.lastIndexOf( '.' );
	const hashIndex = parentDoclet.longname.lastIndexOf( '#' );
	const name = parentDoclet.longname.slice( Math.max( dotIndex, hashIndex ) );

	return childDoclet.longname + name;
}

/**
 * Gets property which should be added to the new doclet (e.g. `inherited` or `mixed`).
 *
 * @param {DocletMap} docletMap
 * @param {Doclet} childDoclet
 * @param {Doclet} memberDoclet
 * @param {'augmentsNested'|'mixesNested'|'implementsNested'} relation
 * @returns {'inherited'|'mixed'|null}
 */
function getRelationProperty( docletMap, childDoclet, memberDoclet, relation ) {
	if ( relation === 'augmentsNested' ) {
		return 'inherited';
	}

	if ( relation === 'mixesNested' ) {
		return 'mixed';
	}

	const memberDocletParent = docletMap[ memberDoclet.memberof ];

	let isInherited = false;
	let isMixed = false;

	// If doclet is a child of a mixin, it's 'mixed'. Else if it's a child of another class, it's 'inherited'.
	if ( isNonEmptyArray( memberDocletParent.descendants ) ) {
		for ( const longname of memberDocletParent.descendants ) {
			const doclet = docletMap[ longname ];

			if ( doclet && doclet.kind === 'mixin' ) {
				if ( isNonEmptyArray( doclet.descendants ) &&
					doclet.descendants.indexOf( childDoclet.longname ) !== -1 ) {
					isMixed = true;
				}
			} else if ( doclet && doclet.kind === 'class' ) {
				if ( isNonEmptyArray( doclet.descendants ) &&
					doclet.descendants.indexOf( childDoclet.longname ) !== -1 ) {
					isInherited = true;
				}
			}
		}
	}

	if ( isMixed ) {
		return 'mixed';
	} else if ( isInherited ) {
		return 'inherited';
	} else {
		return null;
	}
}

/**
 * @param {Array.<Doclet>} doclets
 * @returns {Boolean}
 */
function doAllParentsExplicitlyInherit( doclets ) {
	for ( const doclet of doclets ) {
		if ( doclet.inheritdoc === undefined && doclet.overrides === undefined ) {
			return false;
		}
	}

	return true;
}

/**
 * Creates a <longname, doclet> map.
 *
 * @param {DocletCollection} doclets
 * @returns {Object}
 */
function createDocletMap( doclets ) {
	const docletMap = {};

	for ( const doclet of doclets.getAll() ) {
		if ( !docletMap[ doclet.longname ] ) {
			docletMap[ doclet.longname ] = doclet;
		}
	}

	return docletMap;
}

/**
 * @typedef {Object} Options
 *
 * @property {'augmentsNested'|'mixesNested'|'implementsNested'} relation Name of relation between child entity
 * and its ancestors.
 * @property {Partial<Doclet>} [filter] Object used to filter missing doclets (e.g. { scope: 'static' }).
 * @property {Boolean} [onlyImplicitlyInherited]
 */

/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * Licensed under the terms of the MIT License (see LICENSE.md).
 */

'use strict';

exports.handlers = {
	processingComplete( e ) {
		console.log( JSON.stringify( e, null, 4 ) );
	}
};

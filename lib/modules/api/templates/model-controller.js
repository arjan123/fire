'use strict';

var Q = require('q');
var app = require('{{fire}}').app('{{appName}}');

function unauthenticatedError(authenticator) {
	var error = new Error();

	if(authenticator) {
		error.status = 403;
		error.message = 'Forbidden';
	}
	else {
		error.status = 401;
		error.message = 'Unauthorized';
	}

	return error;
}

function _canUpdateProperties(propertyNames, model) {
	for(var i = 0, il = propertyNames.length; i < il; i++) {
		var propertyName = propertyNames[i];
		var property = model.getProperty(propertyName);

		// TODO: Implement function-based checks.
		if(property && (typeof property.options.canUpdate != 'undefined' && property.options.canUpdate !== true || typeof property.options.canSet != 'undefined' && property.options.canSet !== true)) {
			return false;
		}
	}

	return true;
}

function _canSetProperties(propertyNames, model) {
	for(var i = 0, il = propertyNames.length; i < il; i++) {
		var propertyName = propertyNames[i];
		var property = model.getProperty(propertyName);

		// TODO: Implement function-based checks.
		if(property && typeof property.options.canSet != 'undefined' && property.options.canSet !== true) {
			return false;
		}
	}

	return true;
}

function findAuthenticator(authenticatorModel, request) {
	if(!authenticatorModel) {
		return Q.when(null);
	}

	var credentials = null;
	if(request.headers.authorization && request.headers.authorization.length > 6) {
		credentials = (new Buffer(request.headers.authorization.substring(6), 'base64')).toString('utf8').split(':');

		if(!credentials.length) {
			credentials = null;
		}
		else if(credentials.length == 1) {
			credentials.push('');
		}
	}

	if(credentials) {
		var findMap = {};
		findMap[authenticatorModel.options.authenticatingProperty.name] = credentials[0];
		findMap.accessToken = credentials[1];
		return authenticatorModel.findOne(findMap);
	}

	if(!request.session.at) {
		return Q.when(null);
	}

	return authenticatorModel.findOne({accessToken: request.session.at});
}
{{#model.isAuthenticator}}
app.get('/api/{{model.resourceName}}/me', function(request, {{model.dependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				request.session.save();
				return authenticator;
			}
			else {
				var error = new Error('Unauthorized');
				error.status = 401;
				throw error;
			}
		});
});

app.post('/api/{{model.resourceName}}/sign-out', function(request, {{model.dependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				request.session.at = null;
				authenticator.accessToken = null;
				return authenticator.save();
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		})
		.then(function() {
			return {};
		});
});

app.post('/api/{{model.resourceName}}/authorize', function(request, {{model.dependencyName}}) {
	return {{model.dependencyName}}.getOne({'{{model.authenticatingPropertyName}}': request.body.{{model.authenticatingPropertyName}} })
		.then(function(modelInstance) {
			if(modelInstance.validateHash('password', request.body.password)) {
				return modelInstance;
			}
			else {
				throw new Error('Incorrect password provided.');
			}
		})
		.then(function(modelInstance) {
			request.session.at = modelInstance.accessToken;
			return modelInstance;
		})
		.catch(function(error) {
			throw error;
		});
});

app.post('/api/{{model.resourceName}}/forgot-password', function(request, {{model.dependencyName}}, {{model.name}}ResetPasswordModel) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				var error = new Error('Forbidden');
				error.status = 403;
				throw error;
			}
		})
		.then(function() {
			var findMap = {
				{{model.authenticatingPropertyName}}: request.body.{{model.authenticatingPropertyName}}
			};

			return {{model.dependencyName}}.findOne(findMap);
		})
		.then(function(authenticator) {
			if(authenticator) {
				return {{model.name}}ResetPasswordModel.findOrCreate({authenticator: authenticator})
					.then(function(resetPassword) {
						if(authenticator.onForgotPassword) {
							return authenticator.onForgotPassword.call(authenticator, resetPassword);
						}
					});
			}
		})
		.then(function() {
			// TODO: What should we return other than status code 200?
			return {};
		});
});

app.post('/api/{{model.resourceName}}/reset-password', function(request, {{model.dependencyName}}, {{model.name}}ResetPasswordModel) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				var error = new Error('Forbidden');
				error.status = 403;
				throw error;
			}
		})
		.then(function() {
			return {{model.name}}ResetPasswordModel.getOne({
				token: request.body.resetToken
			});
		})
		.then(function(resetPassword) {
			return Q.all([
				{{model.dependencyName}}.updateOne({id: resetPassword.authenticator}, {password: request.body.password}),
				{{model.name}}ResetPasswordModel.remove({id: resetPassword.id})
			]);
		})
		.spread(function(authenticator) {
			if(authenticator && authenticator.onResetPassword) {
				return authenticator.onResetPassword.call(authenticator);
			}
		})
		.then(function() {
			// TODO: What should we return other than status code 200?
			return {};
		});
});{{/model.isAuthenticator}}

app.post('/api/{{model.resourceName}}', function(app, response, request, {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canCreate(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate === true) {
						var createMap = request.body || {};
						if({{model.dependencyName}}.options.automaticPropertyName) {
							if(createMap[{{model.dependencyName}}.options.automaticPropertyName]) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							createMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
						}

						if(_canSetProperties(Object.keys(createMap), {{model.dependencyName}})) {
							return {{model.dependencyName}}.create(createMap){{#model.isAuthenticator}}
								.then(function(modelInstance) {
									request.session.at = modelInstance.accessToken;
									return modelInstance;
								}){{/model.isAuthenticator}};
						}
						else {
							var error = new Error('Bad Request');
							error.status = 400;
							throw error;
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead === true) {
						var queryMap = request.query || {};
						var optionsMap = {};

						if(queryMap.$options) {
							optionsMap = queryMap.$options;
							delete queryMap.$options;
						}

						if({{model.dependencyName}}.options.automaticPropertyName) {
							queryMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
						}

						return {{model.dependencyName}}.find(queryMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canRead, authenticator) {
			if(canRead === true) {
				var whereMap = request.query || {};
				whereMap.id = request.param('id');

				if({{model.dependencyName}}.options.automaticPropertyName) {
					whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
				}

				return {{model.dependencyName}}.getOne(whereMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	var accessControl = {{model.dependencyName}}.getAccessControl();
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var keyPath = accessControl.getPermissionKeyPath('update');
			return Q.all([keyPath ? true : app.injector.call(accessControl.getPermissionFunction('update'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canUpdate, authenticator) {
			if(canUpdate) {
				var whereMap = request.query || {};

				var keyPath = accessControl.getPermissionKeyPath('update');
				if(keyPath) {
					if(!{{model.dependencyName}}.getProperty(keyPath)) {
						throw new Error('Invalid key path `' + keyPath + '`.');
					}

					whereMap[keyPath] = authenticator;
				}

				if({{model.dependencyName}}.options.automaticPropertyName) {
					whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
				}

				whereMap.id = request.param('id');
				return [_canUpdateProperties(Object.keys(request.body), {{model.dependencyName}}), whereMap, authenticator];
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		})
		.all()
		.spread(function(canUpdateProperties, whereMap, authenticator) {
			if(canUpdateProperties) {
				return Q.all([{{model.dependencyName}}.updateOne(whereMap, request.body), authenticator]);
			}
			else {
				var error = new Error();
				error.status = 400;
				error.message = 'Bad Request';
				throw error;
			}
		})
		.spread(function(modelInstance, authenticator) {
			if(modelInstance) {
				return modelInstance;
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		})
		.catch(function(error) {
			throw error;
		});
});

app.delete('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}))
				.then(function(canDelete) {
					if(canDelete === true) {
						var whereMap = request.query || {};

						var keyPath = accessControl.getPermissionKeyPath('delete');
						if(keyPath) {
							if(!{{model.dependencyName}}.getProperty(keyPath)) {
								throw new Error('Invalid key path `' + keyPath + '`.');
							}

							whereMap[keyPath] = authenticator;
						}

						if({{model.dependencyName}}.options.automaticPropertyName) {
							whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
						}

						return {{model.dependencyName}}.remove(whereMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}))
			.then(function(canDelete) {
				if(canDelete === true) {
					var whereMap = request.query || {};

					whereMap.id = request.param('id');

					var keyPath = accessControl.getPermissionKeyPath('delete');
					if(keyPath) {
						if(!{{model.dependencyName}}.getProperty(keyPath)) {
							throw new Error('Invalid key path `' + keyPath + '`.');
						}

						whereMap[keyPath] = authenticator;
					}

					if({{model.dependencyName}}.options.automaticPropertyName) {
						whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
					}

					return {{model.dependencyName}}.removeOne(whereMap);
				}
				else {
					throw unauthenticatedError(authenticator);
				}
			});
		});
});

{{#model.properties}}
{{#hasMethod}}
app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(app, request, response,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead === true) {
						var property = {{model.dependencyName}}.getProperty('{{name}}');
						return app.injector.call(property.options.hasMethod, {request: request, response: response, authenticator: authenticator});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});
{{/hasMethod}}
{{#isOneToOne}}
app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	// TODO: Add access control?

	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([
				typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true,
				authenticator
			]);
		})
		.spread(function(canCreate, authenticator) {
			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var createMap = request.body || {};

			var property = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = property.getAssociatedModel();

			createMap[property.options.hasOne || property.options.belongsTo] = request.param('id');

			if(associatedModel.options.automaticPropertyName) {
				// This is definitely a bad request if the user tries to set the automatic property manually.
				if(createMap[associatedModel.options.automaticPropertyName]) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				createMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			if(_canSetProperties(Object.keys(createMap), associatedModel)) {
				return associatedModel.create(createMap);
			}
			else {
				var error = new Error('Bad Request');
				error.status = 400;
				throw error;
			}
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead === true) {
						var queryMap = request.query || {};
						var optionsMap = {};

						if(queryMap.$options) {
							optionsMap = queryMap.$options;
							delete queryMap.$options;
						}

						var association = {{model.dependencyName}}.getProperty('{{name}}');
						var associatedModel = association.options.relationshipVia.model;

						queryMap[association.options.relationshipVia.name] = request.param('id');

						if(associatedModel.options.automaticPropertyName) {
							if(queryMap[associatedModel.options.automaticPropertyName]) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							queryMap[associatedModel.options.automaticPropertyName] = authenticator;
						}

						return associatedModel.findOne(queryMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				var removeMap = request.query || {};
				removeMap[association.options.hasOne || association.options.belongsTo] = request.param('id');

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName]) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return associatedModel.removeOne(removeMap, optionsMap);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('update'), {authenticator: authenticator, request: request, response: response}))
				.then(function(canUpdate) {
					if(canUpdate) {
						var association = {{model.dependencyName}}.getProperty('{{name}}');
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), association.options.relationshipVia.model))
							.then(function(canUpdateProperties) {
								var error;
								if(canUpdateProperties) {
									var associatedModel = association.getAssociatedModel();

									var whereMap = request.query || {};

									var keyPath = accessControl.getPermissionKeyPath('update');
									if(keyPath) {
										if(!{{model.dependencyName}}.getProperty(keyPath)) {
											throw new Error('Invalid key path `' + keyPath + '`.');
										}

										whereMap[keyPath] = authenticator;
									}

									whereMap[association.options.hasOne || association.options.belongsTo] = request.param('id');

									if(associatedModel.options.automaticPropertyName) {
										if(whereMap[associatedModel.options.automaticPropertyName]) {
											error = new Error('Cannot set automatic property manually.');
											error.status = 400;
											throw error;
										}

										whereMap[associatedModel.options.automaticPropertyName] = authenticator;
									}

									return associatedModel.updateOne(whereMap, request.body || {});
								}
								else {
									error = new Error();
									error.status = 400;
									error.message = 'Bad Request';
									throw error;
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});
{{/isOneToOne}}
{{#isOneToMany}}
app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	// TODO: Add accessControl

	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true, authenticator]);
		})
		.spread(function(canCreate, authenticator) {
			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getAssociation('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var createMap = request.body || {};

			var property = {{model.dependencyName}}.getProperty('{{name}}');
			createMap[property.options.hasMany] = request.param('id');

			if(associatedModel.options.automaticPropertyName) {
				if(createMap[associatedModel.options.automaticPropertyName]) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				createMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			if(_canSetProperties(Object.keys(createMap), associatedModel)) {
				return associatedModel.create(createMap);
			}
			else {
				var error = new Error('Bad Request');
				error.status = 400;
				throw error;
			}
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead === true) {
						var queryMap = request.query || {};
						var optionsMap = {};

						if(queryMap.$options) {
							optionsMap = queryMap.$options;
							delete queryMap.$options;
						}

						var association = {{model.dependencyName}}.getProperty('{{name}}');
						var associatedModel = association.options.relationshipVia.model;

						queryMap[association.options.relationshipVia.name] = request.param('id');

						if(associatedModel.options.automaticPropertyName) {
							if(queryMap[associatedModel.options.automaticPropertyName]) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							queryMap[associatedModel.options.automaticPropertyName] = authenticator;
						}

						return associatedModel.find(queryMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				var removeMap = {};
				removeMap[association.options.hasMany] = request.param('id');
				removeMap.id = request.param('associationID');

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName]) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				var queryMap = request.query || {};
				var optionsMap = {};

				if(queryMap.$options) {
					optionsMap = queryMap.$options;
					delete queryMap.$options;
				}

				return associatedModel.removeOne(removeMap, optionsMap);
			}
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				var removeMap = request.query || {};
				removeMap[association.options.hasMany] = request.param('id');

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName]) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return associatedModel.remove(removeMap, optionsMap);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('update'), {authenticator: authenticator, request: request, response: response}))
				.then(function(canUpdate) {
					if(canUpdate) {
						var association = {{model.dependencyName}}.getProperty('{{name}}');
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), association.options.relationshipVia.model))
							.then(function(canUpdateProperties) {
								var error;
								if(canUpdateProperties) {
									var whereMap = {};

									var keyPath = accessControl.getPermissionKeyPath('update');
									if(keyPath) {
										if(!{{model.dependencyName}}.getProperty(keyPath)) {
											throw new Error('Invalid key path `' + keyPath + '`.');
										}

										whereMap[keyPath] = authenticator;
									}

									whereMap[association.options.relationshipVia.name] = request.param('id');
									whereMap.id = request.param('associationID');

									var associatedModel = association.options.relationshipVia.model;
									if(associatedModel.options.automaticPropertyName) {
										// This is definitely a bad request if the user tries to set the automatic property manually.
										if(whereMap[associatedModel.options.automaticPropertyName]) {
											error = new Error('Cannot set automatic property manually.');
											error.status = 400;
											throw error;
										}

										whereMap[associatedModel.options.automaticPropertyName] = authenticator;
									}

									return associatedModel.updateOne(whereMap, request.body);
								}
								else {
									error = new Error();
									error.status = 400;
									error.message = 'Bad Request';
									throw error;
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});
{{/isOneToMany}}
{{#isManyToMany}}

app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, app, response,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true, authenticator]);
		})
		.spread(function(canCreate, authenticator) {
			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getAssociation('{{name}}');
			var createMap = request.body;

			var property = {{model.dependencyName}}.getProperty('{{name}}');
			createMap[property.options.throughPropertyName] = request.param('id');

			// TODO: Do we need to set the automatic property name?
			// TODO: Do we need to create any checks?

			return association.options.through.create(createMap);
		})
		.then(function() {
			// TODO: Are we returning the correct model instance here?
			return {{model.dependencyName}}.findOne({id: request.param('id')});
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead === true) {
						var queryMap = request.query || {};
						var optionsMap = {};

						if(queryMap.$options) {
							optionsMap = queryMap.$options;
							delete queryMap.$options;
						}

						var association = {{model.dependencyName}}.getProperty('{{name}}');
						queryMap[association.options.relationshipVia.name] = request.param('id');

						// TODO: What about the automatic property?

						return association.options.relationshipVia.model.find(queryMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}, {{throughModelDependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				var association = {{model.dependencyName}}.getProperty('{{name}}');

				var removeMap = {};
				removeMap[association.options.throughPropertyName] = request.param('id');
				removeMap[association.options.relationshipVia.options.throughPropertyName] = request.param('associationID');

				// TODO: The automatic property name ... ?

				var queryMap = request.query || {};
				var optionsMap = {};

				if(queryMap.$options) {
					optionsMap = queryMap.$options;
					delete queryMap.$options;
				}


				return {{throughModelDependencyName}}.removeOne(removeMap, optionsMap);
			}
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}, {{throughModelDependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				var association = {{model.dependencyName}}.getProperty('{{name}}');

				var removeMap = request.query || {};
				removeMap[association.options.throughPropertyName] = request.param('id');

				// TODO: The automatic property name ... ?

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return {{throughModelDependencyName}}.remove(removeMap, optionsMap);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('update'), {authenticator: authenticator, request: request, response: response}))
				.then(function(canUpdate) {
					if(canUpdate) {
						var association = {{model.dependencyName}}.getProperty('{{name}}');
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), association.options.relationshipVia.model))
							.then(function(canUpdateProperties) {
								if(canUpdateProperties) {
									var whereMap = {};

									var keyPath = accessControl.getPermissionKeyPath('update');
									if(keyPath) {
										if(!{{model.dependencyName}}.getProperty(keyPath)) {
											throw new Error('Invalid key path `' + keyPath + '`.');
										}

										whereMap[keyPath] = authenticator;
									}

									whereMap[association.options.relationshipVia.name] = request.param('id');
									whereMap.id = request.param('associationID');

									var associatedModel = association.options.relationshipVia.model;

									if(associatedModel.options.automaticPropertyName) {
										// This is definitely a bad request if the user tries to set the automatic property manually.
										if(whereMap[associatedModel.options.automaticPropertyName]) {
											var error = new Error('Cannot set automatic property manually.');
											error.status = 400;
											throw error;
										}

										whereMap[associatedModel.options.automaticPropertyName] = authenticator;
									}

									return associatedModel.updateOne(whereMap, request.body || {});
								}
								else {
									var error = new Error();
									error.status = 400;
									error.message = 'Bad Request';
									throw error;
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});{{/isManyToMany}}{{/model.properties}}

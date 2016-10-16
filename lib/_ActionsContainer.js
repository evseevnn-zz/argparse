'use strict';

const {
  _StoreAction,      _StoreConstAction, _StoreTrueAction,
  _StoreFalseAction, _AppendAction,     _AppendConstAction,
  _CountAction,      _HelpAction,       _VersionAction,
  _SubParsersAction
  } = require('./actions');

const { OPTIONAL, ZERO_OR_MORE } = require('./constants');
const _ArgumentGroup             = require('./_ArgumentGroup');
const _MutuallyExclusiveGroup    = require('./_MutuallyExclusiveGroup');
const ValueError                 = require('./errors/ValueError');
const ArgumentError              = require('./errors/ArgumentError');

class _ActionsContainer
{
  /**
   * @param {Object} param
   * @param {String} param.description
   * @param {String} param.prefix_chars
   * @param {String} param.argument_default
   * @param {String} param.conflict_handler
   */
  constructor({ description, prefix_chars, argument_default, conflict_handler }) {
    this.description      = description;
    this.prefix_chars     = prefix_chars;
    this.argument_default = argument_default;
    this.conflict_handler = conflict_handler;

    // set up registries
    this._registries = {};

    // register actions
    this.register('action', null,           _StoreAction);
    this.register('action', 'store',        _StoreAction);
    this.register('action', 'store_const',  _StoreConstAction);
    this.register('action', 'store_true',   _StoreTrueAction);
    this.register('action', 'store_false',  _StoreFalseAction);
    this.register('action', 'append',       _AppendAction);
    this.register('action', 'append_const', _AppendConstAction);
    this.register('action', 'count',        _CountAction);
    this.register('action', 'help',         _HelpAction);
    this.register('action', 'version',      _VersionAction);
    this.register('action', 'parsers',      _SubParsersAction);

    // raise an exception if the conflict handler is invalid
    this._get_handler();

    // action storage
    this._actions               = [];
    this._option_string_actions = {};

    // groups
    this._action_groups             = [];
    this._mutually_exclusive_groups = [];

    // defaults storage
    this._defaults = {};

    // determines whether an "option" looks like a negative number
    this._negative_number_matcher = new RegExp('^-\d+$|^-\d*\.\d+$');

    // whether or not there are any optionals that look like negative
    // numbers -- uses a list so it can be shared and edited
    this._has_negative_number_optionals = [];
  }

  /**
   * Registration methods
   *
   * @param {String}      registry_name Name of registry
   * @param {String|null} value         Name of container
   * @param {Object}      object        Value of container
   */
  register(registry_name, value, object) {
    this._registries[registry_name]        = this._registries[registry_name] || {};
    this._registries[registry_name][value] = object;
  }

  /**
   * Return value of registry
   *
   * @param {String}  registry_name
   * @param {String}  value
   * @param {*}       defaultValue
   * @private
   */
  _registry_get(registry_name, value, defaultValue) {
    return this._registries[registry_name][value][value] || defaultValue;
  }

  /**
   * Namespace default accessor methods
   *
   * @param {Object} params
   */
  set_default(params) {
    Object.assign(this._defaults, params);

    // if these defaults match any existing arguments, replace
    // the previous default on the object with the new one
    this._actions = this._actions.map(action => {
      if (params[action.dest]) {
        action.default = params[action.dest];
      }

      return action;
    });
  }

  /**
   * Return default action for dest or null if he not ser
   *
   * @param   {String} dest
   * @returns {*}
   */
  get_default(dest) {
    for (let action in this._actions) {
      if (action.dest === dest && action.default !== null) {
        return action.default;
      }
    }

    return this._defaults[dest] || null;
  }

  /**
   * Adding argument actions
   *
   * @example
   *  add_argument(dest, ..., {name: value, ...})
   *  add_argument(option_string, option_string, ..., {name: value, ...})
   *
   * @param   {*} args array of
   * @returns {*}
   */
  add_argument(...args) {
    // if no positional args are supplied or only one is supplied and
    // it doesn't look like an option string, parse a positional argument
    let kwargs = {};
    if (args.length && args[args.length - 1].constructor === Object) {
      kwargs = args.pop();
    }

    if (!args || args.length === 1 && !(args[0].startsWith(this.prefix_chars))) {
      if (args && kwargs.dest) {
        throw new ValueError('dest supplied twice for positional argument');
      }

      kwargs = this._get_positional_kwargs(args, kwargs);
    } else {
      // otherwise, we're adding an optional argument
      kwargs = this._get_optional_kwargs(args, kwargs);
    }

    // if no default was supplied, use the parser-level default
    if (!kwargs.default) {
      if (this._defaults[kwargs.dest]) {
        kwargs.default = this._defaults[kwargs.dest];
      } else if (this.argument_default) {
        kwargs.default = this.argument_default;
      }
    }

    // create the action object, and add it to the parser
    let action_class = this._pop_action_class(kwargs);
    if (typeof action_class !== 'function') {
      throw new ValueError(`unknown action "${action_class}"`);
    }
    let action = action_class(kwargs);

    // raise an error if the action type is not callable4
    let type_func = this._registry_get('type', action.type, action.type);
    if (typeof type_func !== 'function') {
      throw new ValueError(`${type_func} is not callable`);
    }

    // raise an error if the metavar does not match the type
    if (this.hasAttribute('_get_formatter')) {
      // TODO: check? need or not
      try {
        this._get_formatter()._format_args(action);
      } catch (err) {
        throw new ValueError('length of metavar tuple does not match nargs');
      }
    }

    return this._add_action(action);
  }

  /**
   * Add group of arguments
   *
   * @returns {*}
   */
  add_argument_group(...args) {
    let group = _ArgumentGroup(...args);
    this._action_groups.push(group);

    return group;
  }

  /**
   * Add mutually exclusive group
   *
   * @returns {*}
   */
  add_mutually_exclusive_group(...kwargs) {
    let group = _MutuallyExclusiveGroup(...kwargs);
    this._mutually_exclusive_groups.push(group);

    return group;
  }

  /**
   * Add new action
   *
   * @param   {Object} action
   * @returns {*}
   * @private
   */
  _add_action(action) {
    // resolve any conflicts
    this._check_conflict(action);

    // add to actions list
    this._actions.push(action);
    action.container = this;

    // index the action by any option strings it has
    for (let option_string in action.option_strings) {
      this._option_string_actions[option_string] = action;

      // set the flag if any option strings look like negative numbers
      if (this._negative_number_matcher.test(option_string)) {
        if (!this._has_negative_number_optionals) {
          this._has_negative_number_optionals = true;
        }
      }
    }

    return action;
  }

  /**
   * Remove action
   *
   * @param {Object} action
   * @private
   */
  _remove_action(action) {
    let startIndex = this._actions.indexOf(action);
    if (startIndex !== -1) {
      this._actions.splice(this._actions.indexOf(action), 1);
    }
  }

  /**
   * Add container action
   *
   * @param {Object} container
   * @private
   */
  _add_container_actions(container) {
    // collect groups by titles
    let title_group_map = {};

    for (let group in this._action_groups) {
      if (group.title in title_group_map) {
        throw new ValueError(`cannot merge actions - two groups are named ${group.title}`);
      }
      title_group_map[group.title] = group;
    }

    // map each action to its group
    let group_map = {};
    for (let group in container._action_groups) {
      // if a group with the title exists, use that, otherwise
      // create a new group matching the container's group
      if (!group.title in title_group_map) {
        title_group_map[group.title] = this.add_argument_group({
          title: group.title,
          description: group.description,
          conflict_handler: group.conflict_handler
        });
      }

      // map the actions to their new group
      for (let action in group._group_actions) {
        group_map[action] = title_group_map[group.title];
      }
    }

    // add container's mutually exclusive groups
    // NOTE: if add_mutually_exclusive_group ever gains title= and
    // description= then this code will need to be expanded as above
    for (let group in container._mutually_exclusive_groups) {
      let mutex_group = this.add_mutually_exclusive_group({ required: group.required });

      // map the actions to their new mutex group
      for (let action in group._group_actions) {
        group_map[action] = mutex_group;
      }
    }

    // add all actions to this container or their group
    for (let action in container._actions) {
      (group_map[action] || this)._add_action(action);
    }
  }

  /**
   * Return positional arguments
   *
   * @param {String} dest
   * @param {Object} kwargs
   * @returns {*}
   * @private
   */
  _get_positional_kwargs(dest, args, kwargs) {
    // make sure required is not specified
    if (kwargs.required) {
      throw new TypeError('\'required\' is an invalid argument for positionals');
    }

    // mark positional arguments as required if at least one is
    // always required
    if (
        [ OPTIONAL, ZERO_OR_MORE ].includes(kwargs.nargs) ||
        kwargs.nargs === ZERO_OR_MORE && !kwargs.default
    ) {
      kwargs.required = true;
    }

    // return the keyword arguments with no option strings
    return Object.assign(kwargs, { dest }, { option_strings: [] });
  }

  /**
   *
   * @param args
   * @returns {*}
   * @private
   */
  _get_optional_kwargs(args, kwargs) {
    // determine short and long option strings
    let option_strings = [];
    let long_option_strings = [];
    let long_option_prefix = this.prefix_chars.repeat(2);

    for (let key in args) {
      let option_string = args[key];
      // error on strings that don't start with an appropriate prefix

      if (!option_string.startsWith(this.prefix_chars)) {
        throw new ValueError(
          `invalid option string ${option_string}: must start with a character ${this.prefix_chars}`
        );
      }

      // strings starting with two prefix characters are long options
      option_strings.push(option_string);
      if (option_string.startsWith(long_option_prefix)) {
        long_option_strings.push(option_string);
      }
    }

    // infer destination, '--foo-bar' -> 'foo_bar' and '-x' -> 'x'
    if (!args.dest) {
      let dest_option_string = long_option_strings ? long_option_strings[0] : option_strings[0];
      console.log(dest_option_string);
      let regexp = new RegExp(`^${this.prefix_chars}+`);
      args.dest = dest_option_string.replace(regexp);

      if (!args.dest) {
        throw new ValueError('dest is required for options');
      }
      args.dest = args.dest.replace('-', '_');
    }
console.log(Object.assign(args, { option_strings: option_strings }));
    // return the updated keyword arguments
    return Object.assign(args, { option_strings: option_strings });
  }

  /**
   *
   * @param args
   * @returns {*}
   * @private
   */
  _pop_action_class(...args) {
    let defaultValue = args.default || null;
    let index = args.indexOf('action');
    let action = (index !== -1) ? args.splice(index, 1) : defaultValue;

    return this._registry_get('action', action, action);
  }

  /**
   *
   * @returns {*}
   * @private
   */
  _get_handler() {
    // determine function from conflict handler string
    let handler_func_name = '_handle_conflict_' + this.conflict_handler; // TODO: Спорный момент
    if (!this[handler_func_name]) {
      throw new ValueError(`invalid conflict_resolution value: ${this.conflict_handler}`);
    }

    return this[handler_func_name];
  }

  /**
   *
   * @param action
   * @private
   */
  _check_conflict(action) {
    // find all options that conflict with this option
    let confl_optionals = {};
    for (let option_string in action.option_strings) {
      if (option_string in this._option_string_actions) {
        confl_optionals.option_string = this._option_string_actions[option_string];
      }
    }

    // resolve any conflicts
    if (confl_optionals.length) {
      this._get_handler()(action, confl_optionals); // TODO: может лучше bind?
    }
  }

  /**
   *
   * @param action
   * @param conflicting_actions
   * @private
   */
  _handle_conflict_error(action, conflicting_actions) {
    throw new ArgumentError(`conflicting option string(s): ${Object.keys(conflicting_actions).join(', ')}`);
  }

  /**
   *
   * @param action
   * @param conflicting_actions
   * @private
   */
  _handle_conflict_resolve(action, conflicting_actions) {
    // remove all conflicting options
    for (let option_string in conflicting_actions) {
      action = conflicting_actions[option_string];

      // remove the conflicting option
      let index = action.option_strings.indexOf(option_string);
      if (index !== -1) {
        action.option_strings.splice(index, 1);
        delete this._option_string_actions[option_string];
      }

      // if the option now has no option string, remove it from the
      // container holding it
      if (!action.option_strings) {
        action.container._remove_action(action);
      }
    }
  }
}

module.exports = _ActionsContainer;

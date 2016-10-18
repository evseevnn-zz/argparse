'use strict';

const _ActionsContainer = require('./_ActionsContainer');

class _ArgumentGroup extends _ActionsContainer
{
  constructor(...args) {
    // add any missing keyword arguments by checking the container
    let kwargs = {};
    if (args.length && args[args.length - 1].constructor === Object) {
      kwargs = args.pop();
    }

    kwargs.conflict_handler = kwargs.conflict_handler || args.container && args.container.conflict_handler || 'error';
    kwargs.prefix_chars     = kwargs.prefix_chars || args.container && args.container.prefix_chars || null;
    kwargs.argument_default = kwargs.argument_default || args.container && args.container.argument_default || null;
    super(kwargs);

    // group attributes
    this.title = args.title;
    this._group_actions = [];

    // share most attributes with the container
    if (args.container) {
      this._registries                    = args.container._registries;
      this._actions                       = args.container._actions;
      this._option_string_actions         = args.container._option_string_actions;
      this._defaults                      = args.container._defaults;
      this._has_negative_number_optionals = args.container._has_negative_number_optionals;
      this._mutually_exclusive_groups     = args.container._mutually_exclusive_groups;
    }
  }

  _add_action(action) {
    action = super._add_action(action);
    this._group_actions.push(action);
    return action;
  }

  _remove_action(action) {
    super._remove_action(action);
    let index = this._group_actions.indexOf(action);
    delete this._group_actions[index];
  }
}

module.exports = _ArgumentGroup;

'use strict';

const _ArgumentGroup = require('./_ArgumentGroup');
const ValueError = require('./errors/ValueError');

class _MutuallyExclusiveGroup extends _ArgumentGroup
{
  constructor(container, required = false) {
    //super({ container: container });
    this.required   = required;
    this._container = container;
  }

  _add_action(action) {
    if (action.required) {
      throw new ValueError('mutually exclusive arguments must be optional');
    }

    action = this._container._add_action(action);
    this._group_actions.push(action);
    return action;
  }

  _remove_action(action) {
    this._container._remove_action(action);
    let index = this._group_actions.indexOf(action);
    delete this._group_actions[index];
  }
}

module.exports = _MutuallyExclusiveGroup;

'use strict';

const Action       = require('../Action');
const ValueError   = require('../errors/ValueError');
const { OPTIONAL } = require('../constants');

class _StoreAction extends Action
{
  constructor({
    option_strings,
    dest,
    nargs = null,
    constant = null,
    defaultValue = null,
    type = null,
    choices = null,
    required = false,
    help = null,
    metavar = null
    }) {

    if (nargs === 0) {
      throw new ValueError(
        `nargs for store actions must be > 0; if you
        have nothing to store, actions such as store
        true or store const may be more appropriate`
      );
    }
    if (constant !== null && nargs !== OPTIONAL) {
      throw new ValueError(`nargs must be ${OPTIONAL} to supply const`);
    }
    super(option_strings,
      dest,
      nargs,
      constant ,
      defaultValue,
      type,
      choices,
      required,
      help,
      metavar);
  }
}

module.exports = _StoreAction;

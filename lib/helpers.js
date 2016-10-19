'use strict';

const { SUPPRESS } = require('./');

function _get_action_name(argument) {
  if (!argument) {
    return null;
  } else if (argument.option_strings) {
    return  argument.option_strings.join('/');
  } else if (![ null, SUPPRESS ].includes(argument.metavar)) {
    return argument.metavar;
  } else if (![ null, SUPPRESS ].includes(argument.dest)) {
    return argument.dest;
  }

  return null;
}

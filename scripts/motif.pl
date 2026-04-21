#!/usr/bin/perl
use strict;
use warnings;

my ($sequence, $motif) = @ARGV;

my @positions;

while ($sequence =~ /$motif/g) {
    push @positions, pos($sequence) - length($&);
}

if (@positions) {
    print join(",", @positions);
} else {
    print "No match found";
}
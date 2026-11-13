#!/usr/bin/perl
use strict;
use warnings;
my ($sequence, $motif) = map { uc($_ // '') } @ARGV;
die "Invalid sequence or motif\n" unless $sequence =~ /^[A-Z]+$/ && $motif =~ /^[A-Z]+$/;
my @positions;
my $offset = 0;
while (1) {
    my $position = index($sequence, $motif, $offset);
    last if $position < 0;
    push @positions, $position;
    $offset = $position + 1;
}
print @positions ? join(',', @positions) : 'No match found';

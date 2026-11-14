#!/usr/bin/perl
use strict;
use warnings;

my $dna = $ARGV[0];
$dna = uc($dna);

my $gc = ($dna =~ tr/GC//);
my $length = length($dna);

if ($length == 0) {
    print "0";
} else {
    my $gc_content = ($gc / $length) * 100;
    printf "%.2f", $gc_content;
}
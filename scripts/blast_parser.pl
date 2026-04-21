#!/usr/bin/perl
use strict;
use warnings;

my $file = $ARGV[0];

open(my $fh, "<", $file) or die "Cannot open file";

my $query = "";
my $hit = "";
my $identity = "";
my $length = "";
my $evalue = "";

my $found = 0;

print "\n🔬 BLAST PARSED RESULTS\n========================\n";

while (my $line = <$fh>) {
    chomp $line;

    # Query
    if ($line =~ /^Query=\s*(.+)/) {
        $query = $1;
    }

    # Hit
    if ($line =~ /^>\s*(.+)/) {
        $hit = $1;
        $found = 1;
    }

    # Score block (more general parsing)
    if ($line =~ /Identities = (\d+)\/(\d+)/) {
        my $matches = $1;
        my $len = $2;

        $identity = sprintf("%.2f", ($matches/$len)*100);
        $length = $len;
    }

    if ($line =~ /Expect(\(|\s)=\s*([^\s,]+)/) {
        $evalue = $2;

        print "
========================
Query: $query
Hit: $hit
Identity: $identity%
Alignment Length: $length
E-value: $evalue
========================
";
    }
}

if (!$found) {
    print "\n⚠️ No standard BLAST format detected. Please export BLAST as 'pairwise text format'.\n";
}

close($fh);
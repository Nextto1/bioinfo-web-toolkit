#!/usr/bin/perl
use strict;
use warnings;

my $protein = uc($ARGV[0]);

my %score = (
    "Nucleus" => 0,
    "Mitochondria" => 0,
    "Secretory/Golgi" => 0,
    "Membrane" => 0,
    "Cytoplasm" => 0
);

# 🔬 Nuclear signals (rich in K/R)
if ($protein =~ /(KKK|RRR|KRK|KRR)/) {
    $score{"Nucleus"} += 2;
}

# 🔬 Mitochondrial targeting signal (loose heuristic)
if ($protein =~ /^M[A-Z]{5,20}/ && $protein =~ /[LR]/) {
    $score{"Mitochondria"} += 2;
}

# 🔬 Secretory / Golgi signal (signal peptide-like)
if ($protein =~ /^M.{5,25}[ST]/) {
    $score{"Secretory/Golgi"} += 2;
}

# 🔬 Membrane proteins (hydrophobic content)
my $hydrophobic = ($protein =~ tr/AILMFWYV//);
if (length($protein) > 0 && ($hydrophobic / length($protein)) > 0.4) {
    $score{"Membrane"} += 2;
}

# 🔬 Cytoplasm baseline
$score{"Cytoplasm"} += 1;

# 🔍 Determine best match
my $best = "Unknown";
my $max = 0;

foreach my $loc (keys %score) {
    if ($score{$loc} > $max) {
        $max = $score{$loc};
        $best = $loc;
    }
}

# ❗ Confidence check
if ($max < 2) {
    print "No strong prediction (likely Cytoplasm)";
} else {
    print "$best (confidence score: $max)";
}
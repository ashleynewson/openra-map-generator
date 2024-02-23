#!/usr/bin/env perl

use strict;
use warnings;

use YAML qw(LoadFile DumpFile);
use JSON::PP qw(encode_json);
use Readonly;

Readonly my $tileset_yaml => "temperat.yaml";
Readonly my $adjacency_yaml => "temperat-adjacent.yaml";
Readonly my $template_paths_yaml => "temperat-template-paths.yaml";
Readonly my $output_yaml => "temperat-info.yaml";
Readonly my $output_json => "temperat-info.json";

my $tileset = LoadFile($tileset_yaml);
my $adjacency = LoadFile($adjacency_yaml);
my $template_paths = LoadFile($template_paths_yaml);

my $tile_info = {};

my %coveredIds;
for my $ti (keys %$adjacency) {
    my ($id) = ($ti =~ /^t(\d+)(?:i\d+)?$/);
    $id // die("bad ti format $ti");
    $coveredIds{$id} = undef;
}

for my $template (values %{$tileset->{Templates}}) {
    my $id = $template->{Id};
    next if !exists($coveredIds{$id}); # Adjacency data not available

    my $pickany = $template->{PickAny};
    my ($size_x, $size_y) = ($template->{Size} =~ /^(\d+),(\d+)$/);
    die "Bad size $template->{Size}" if !defined($size_y);
    die "Expected size 1,1 for PickAny" if $pickany && ($size_x != 1 || $size_y != 1);
    for (my $y = 0; $y < $size_y; $y++) {
        for (my $x = 0; $x < $size_x; $x++) {
            my $index = $x + $y * $size_x;
            my $type = $template->{Tiles}->{$index};
            my $ti = $pickany ? "t${id}" : "t${id}i${index}";
            my $tile_adjacency = $adjacency->{$ti};

            if (!defined($type)) {
                if (defined($adjacency->{$ti})) {
                    die "Adjacency defined for non-existent tile: $ti";
                }
                next;
            }

            $tile_adjacency //= {}; # Internal - implicit

            my $all_types = {$type => undef};
            my ($l, $r, $u, $d);
            while (my ($k, $v) = each %$tile_adjacency) {
                if ($k =~ /L/) {
                    $l = $v;
                }
                if ($k =~ /R/) {
                    $r = $v;
                }
                if ($k =~ /U/) {
                    $u = $v;
                }
                if ($k =~ /D/) {
                    $d = $v;
                }
                if ($type =~ (/^(Beach|Rough)$/) && $k =~ /[LRUD]/) {
                    # if ($v =~ /(^|Left|Right|Up|Down)Grass(Left|Right|Up|Down)
                    if ($v =~ /Grass/) {
                        $all_types->{"Grass"} = undef;
                    }
                    if ($v =~ /Water/) {
                        $all_types->{"Water"} = undef;
                    }
                    if ($v =~ /Beach/) {
                        $all_types->{"Beach"} = undef;
                    }
                }
            }
            # Need if it goes onto an external/undefined square
            my $need_l = $x == 0 || !defined($template->{Tiles}->{$index - 1});
            my $need_r = $x == $size_x - 1 || !defined($template->{Tiles}->{$index + 1});
            my $need_u = $y == 0 || !defined($template->{Tiles}->{$index - $size_x});
            my $need_d = $y == $size_y - 1 || !defined($template->{Tiles}->{$index + $size_x});
            die "L inconsistency for $ti" if ($need_l != defined($l));
            die "R inconsistency for $ti" if ($need_r != defined($r));
            die "U inconsistency for $ti" if ($need_u != defined($u));
            die "D inconsistency for $ti" if ($need_d != defined($d));
            # These won't match for a PickAny
            if (!$need_l) {
                my $li = $index - 1;
                $l = "t${id}i${li}-$ti";
            }
            if (!$need_r) {
                my $ri = $index + 1;
                $r = "$ti-t${id}i${ri}";
            }
            if (!$need_u) {
                my $ui = $index - $size_x;
                $u = "t${id}i${ui}-$ti";
            }
            if (!$need_d) {
                my $di = $index + $size_x;
                $d = "$ti-t${id}i${di}";
            }
            my $codes;
            if ($pickany) {
                $codes = [];
                for my $altindex (sort {$a <=> $b} (keys %{$template->{Tiles}})) {
                    push @$codes, "t${id}i${altindex}";
                }
            } else {
                $codes = [$ti];
            }
            $tile_info->{$ti} = {
                Type => $type,
                Codes => $codes,
                AllTypes => [sort keys %$all_types],
                L => $l,
                R => $r,
                U => $u,
                D => $d,
            };
        }
    }
}

my $output = {
    Tileset => $tileset,
    TileInfo => $tile_info,
    TemplatePaths => $template_paths,
};

DumpFile($output_yaml, $output);
{
    my $json = encode_json($output);
    open(my $f, '>', $output_json) || die "Bad open: $!";
    print $f $json;
    close($f);
}

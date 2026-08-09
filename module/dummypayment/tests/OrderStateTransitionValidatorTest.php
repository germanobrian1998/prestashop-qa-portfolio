<?php
require __DIR__ . '/../classes/OrderStateTransitionValidator.php';

$expected = [
    'pending->approved' => 'valid',
    'pending->rejected' => 'valid',
    'pending->timeout' => 'valid',
    'pending->pending' => 'idempotent',
    'timeout->approved' => 'valid',
    'timeout->rejected' => 'valid',
    'timeout->timeout' => 'idempotent',
    'timeout->pending' => 'invalid',
    'approved->approved' => 'idempotent',
    'approved->rejected' => 'invalid',
    'approved->pending' => 'invalid',
    'approved->timeout' => 'invalid',
    'rejected->rejected' => 'idempotent',
    'rejected->approved' => 'invalid', // el caso explícito del enunciado
    'rejected->pending' => 'invalid',
    'rejected->timeout' => 'invalid',
];

$failures = 0;
foreach ($expected as $case => $expectedResult) {
    [$from, $to] = explode('->', $case);
    $actual = OrderStateTransitionValidator::evaluate($from, $to);
    $status = $actual === $expectedResult ? 'OK' : 'FAIL';
    if ($status === 'FAIL') { $failures++; }
    printf("%-6s %-28s esperado=%-11s obtenido=%-11s\n", $status, $case, $expectedResult, $actual);
}

echo "\n" . ($failures === 0 ? "TODOS LOS CASOS PASARON (16/16)" : "$failures CASOS FALLARON") . "\n";
exit($failures === 0 ? 0 : 1);

<?php

test('the scheduler page responds successfully', function () {
    $response = $this->get(route('tasks.index'));

    $response->assertOk();
});

<?php
/**
 * OptiDent System - Ultra-Fast MongoDB Database Connection Manager
 * Powered by native PHP ext-mongodb C Driver (sub-millisecond queries)
 * Directly interfaces with local MongoDB instance (127.0.0.1:27017 / OptiDent)
 */

date_default_timezone_set('Asia/Manila');

class MongoDBConnection {
    private static $instance = null;
    private $dbName = 'OptiDent';
    private $mongoUri = 'mongodb://127.0.0.1:27017';
    private $useNative = false;
    private $manager = null;
    private $fallbackDataFile;

    private function __construct() {
        $this->fallbackDataFile = __DIR__ . '/../../database_mongo_storage.json';
        
        if (extension_loaded('mongodb')) {
            try {
                $this->manager = new \MongoDB\Driver\Manager($this->mongoUri);
                // Verify connection with a quick ping
                $pingCmd = new \MongoDB\Driver\Command(['ping' => 1]);
                $this->manager->executeCommand($this->dbName, $pingCmd);
                $this->useNative = true;
            } catch (\Exception $e) {
                $this->useNative = false;
            }
        }
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new MongoDBConnection();
        }
        return self::$instance;
    }

    /**
     * Helper to prepare filters (supports both string and ObjectId _id queries)
     */
    private function prepareFilter($filter) {
        if (empty($filter)) return [];
        $prepared = [];
        foreach ($filter as $k => $v) {
            if ($k === '_id' && is_string($v) && preg_match('/^[a-f\d]{24}$/i', $v)) {
                $prepared['$or'] = [
                    ['_id' => $v],
                    ['_id' => new \MongoDB\BSON\ObjectId($v)]
                ];
            } else {
                $prepared[$k] = $v;
            }
        }
        return $prepared;
    }

    /**
     * Format BSON document to clean PHP associative array
     */
    private function formatDoc($doc) {
        if (!$doc) return null;
        $arr = json_decode(json_encode($doc), true);
        if (isset($doc->_id)) {
            $arr['_id'] = (string)$doc->_id;
        }
        foreach ($arr as $key => $val) {
            if (is_array($val) && isset($val['$date'])) {
                if (is_array($val['$date']) && isset($val['$date']['$numberLong'])) {
                    $arr[$key] = date('Y-m-d H:i:s', (int)($val['$date']['$numberLong'] / 1000));
                } else if (is_string($val['$date'])) {
                    $arr[$key] = date('Y-m-d H:i:s', strtotime($val['$date']));
                }
            }
        }
        return $arr;
    }

    /**
     * Find single document
     */
    public function findOne($collection, $filter = []) {
        if ($this->useNative) {
            try {
                $query = new \MongoDB\Driver\Query($this->prepareFilter($filter), ['limit' => 1]);
                $cursor = $this->manager->executeQuery("{$this->dbName}.{$collection}", $query);
                $docs = $cursor->toArray();
                if (!empty($docs)) {
                    return $this->formatDoc($docs[0]);
                }
                return null;
            } catch (\Exception $e) {
                // fallback if query fails
            }
        }

        // Fast mongosh fallback
        $filterJs = $this->buildMongoshFilterJs($filter);
        $js = "const doc = db.{$collection}.findOne({$filterJs}); print(JSON.stringify(doc));";
        $raw = $this->execMongosh($js);
        
        if ($raw && $raw !== 'null' && strpos($raw, '{') !== false) {
            $start = strpos($raw, '{');
            $jsonStr = substr($raw, $start);
            $parsed = json_decode($jsonStr, true);
            if ($parsed) return $parsed;
        }

        return $this->fallbackFindOne($collection, $filter);
    }

    /**
     * Insert single document
     */
    public function insertOne($collection, $document) {
        $document['created_at'] = $document['created_at'] ?? date('Y-m-d H:i:s');

        if ($this->useNative) {
            try {
                $bulk = new \MongoDB\Driver\BulkWrite();
                if (empty($document['_id'])) {
                    $document['_id'] = new \MongoDB\BSON\ObjectId();
                }
                $bulk->insert($document);
                $this->manager->executeBulkWrite("{$this->dbName}.{$collection}", $bulk);
                return (string)$document['_id'];
            } catch (\Exception $e) {
                // fallback
            }
        }

        $docJson = json_encode($document);
        $js = "const res = db.{$collection}.insertOne({$docJson}); print(JSON.stringify(res));";
        $raw = $this->execMongosh($js);

        if ($raw && strpos($raw, 'insertedId') !== false) {
            $start = strpos($raw, '{');
            $jsonStr = substr($raw, $start);
            $parsed = json_decode($jsonStr, true);
            if (!empty($parsed['insertedId'])) {
                return is_array($parsed['insertedId']) ? ($parsed['insertedId']['$oid'] ?? (string)$parsed['insertedId']) : (string)$parsed['insertedId'];
            }
        }

        return $this->fallbackInsertOne($collection, $document);
    }

    /**
     * Find multiple documents
     */
    public function find($collection, $filter = [], $options = []) {
        if ($this->useNative) {
            try {
                $query = new \MongoDB\Driver\Query($this->prepareFilter($filter), $options);
                $cursor = $this->manager->executeQuery("{$this->dbName}.{$collection}", $query);
                $results = [];
                foreach ($cursor as $doc) {
                    $results[] = $this->formatDoc($doc);
                }
                return $results;
            } catch (\Exception $e) {
                // fallback
            }
        }

        $filterObj = empty($filter) ? new \stdClass() : (object)$filter;
        $filterJson = json_encode($filterObj);
        $js = "const docs = db.{$collection}.find({$filterJson}).toArray(); print(JSON.stringify(docs));";
        $raw = $this->execMongosh($js);

        if ($raw && strpos($raw, '[') !== false) {
            $start = strpos($raw, '[');
            $jsonStr = substr($raw, $start);
            $parsed = json_decode($jsonStr, true);
            if (is_array($parsed)) return $parsed;
        }

        return $this->fallbackFind($collection, $filter);
    }

    /**
     * Update single document
     */
    public function updateOne($collection, $filter = [], $update = []) {
        // Automatically ensure atomic operator syntax for MongoDB to prevent document replacement
        if (is_array($update)) {
            $hasOperator = false;
            foreach (array_keys($update) as $k) {
                if (is_string($k) && isset($k[0]) && $k[0] === '$') {
                    $hasOperator = true;
                    break;
                }
            }
            if (!$hasOperator && !empty($update)) {
                $update = ['$set' => $update];
            }
        }

        if ($this->useNative) {
            try {
                $bulk = new \MongoDB\Driver\BulkWrite();
                $bulk->update($this->prepareFilter($filter), $update, ['multi' => false]);
                $res = $this->manager->executeBulkWrite("{$this->dbName}.{$collection}", $bulk);
                return $res->getModifiedCount();
            } catch (\Exception $e) {
                // fallback
            }
        }

        $filterJs = $this->buildMongoshFilterJs($filter);
        $updateObj = empty($update) ? new \stdClass() : (object)$update;
        $updateJson = json_encode($updateObj);
        $js = "const res = db.{$collection}.updateOne({$filterJs}, {$updateJson}); print(JSON.stringify(res));";
        $raw = $this->execMongosh($js);

        if ($raw && strpos($raw, 'modifiedCount') !== false) {
            $start = strpos($raw, '{');
            $jsonStr = substr($raw, $start);
            $parsed = json_decode($jsonStr, true);
            return $parsed['modifiedCount'] ?? 1;
        }

        return $this->fallbackUpdateOne($collection, $filter, $update);
    }

    /**
     * Delete single document
     */
    public function deleteOne($collection, $filter = []) {
        if ($this->useNative) {
            try {
                $bulk = new \MongoDB\Driver\BulkWrite();
                $bulk->delete($this->prepareFilter($filter), ['limit' => 1]);
                $res = $this->manager->executeBulkWrite("{$this->dbName}.{$collection}", $bulk);
                return $res->getDeletedCount();
            } catch (\Exception $e) {
                // fallback
            }
        }

        $filterJs = $this->buildMongoshFilterJs($filter);
        $js = "const res = db.{$collection}.deleteOne({$filterJs}); print(JSON.stringify(res));";
        $raw = $this->execMongosh($js);

        if ($raw && strpos($raw, 'deletedCount') !== false) {
            $start = strpos($raw, '{');
            $jsonStr = substr($raw, $start);
            $parsed = json_decode($jsonStr, true);
            return $parsed['deletedCount'] ?? 1;
        }

        return $this->fallbackDeleteOne($collection, $filter);
    }

    /**
     * Count documents matching filter
     */
    public function count($collection, $filter = []) {
        if ($this->useNative) {
            try {
                $cmd = new \MongoDB\Driver\Command([
                    'count' => $collection,
                    'query' => empty($filter) ? new \stdClass() : (object)$this->prepareFilter($filter)
                ]);
                $cursor = $this->manager->executeCommand($this->dbName, $cmd);
                $res = $cursor->toArray();
                return (int)($res[0]->n ?? 0);
            } catch (\Exception $e) {
                // fallback
            }
        }

        $all = $this->find($collection, $filter);
        return count($all);
    }

    /**
     * Builds a mongosh filter JS expression, supporting both string and ObjectId _id queries
     */
    private function buildMongoshFilterJs($filter) {
        if (empty($filter)) return '{}';
        $filterJson = json_encode((object)$filter);
        return preg_replace('/"_id"\s*:\s*"([a-f\d]{24})"/', '"$or":[{"_id":"$1"},{"_id":ObjectId("$1")}]', $filterJson);
    }

    /**
     * Executes queries directly against local MongoDB via mongosh as fallback
     */
    private function execMongosh($jsCode) {
        $escapedJs = addcslashes($jsCode, '"');
        $cmd = "mongosh \"{$this->mongoUri}/{$this->dbName}\" --quiet --eval \"{$escapedJs}\" 2>&1";
        $output = shell_exec($cmd);
        return $output !== null ? trim($output) : '';
    }

    // --- JSON Storage Fallback Handlers ---
    private function fallbackFindOne($collection, $filter) {
        if (!file_exists($this->fallbackDataFile)) return null;
        $data = json_decode(file_get_contents($this->fallbackDataFile), true) ?? [];
        if (!isset($data[$collection])) return null;

        foreach ($data[$collection] as $doc) {
            $match = true;
            foreach ($filter as $k => $v) {
                if (!isset($doc[$k]) || $doc[$k] !== $v) {
                    $match = false; break;
                }
            }
            if ($match) return $doc;
        }
        return null;
    }

    private function fallbackInsertOne($collection, $doc) {
        if (!isset($doc['_id'])) $doc['_id'] = bin2hex(random_bytes(12));
        $data = file_exists($this->fallbackDataFile) ? json_decode(file_get_contents($this->fallbackDataFile), true) : [];
        $data[$collection][] = $doc;
        file_put_contents($this->fallbackDataFile, json_encode($data, JSON_PRETTY_PRINT));
        return $doc['_id'];
    }

    private function fallbackFind($collection, $filter) {
        if (!file_exists($this->fallbackDataFile)) return [];
        $data = json_decode(file_get_contents($this->fallbackDataFile), true) ?? [];
        if (!isset($data[$collection])) return [];
        return $data[$collection];
    }

    private function fallbackUpdateOne($collection, $filter, $update) {
        if (!file_exists($this->fallbackDataFile)) return 0;
        $data = json_decode(file_get_contents($this->fallbackDataFile), true) ?? [];
        if (!isset($data[$collection])) return 0;

        $setFields = $update['$set'] ?? $update;
        foreach ($data[$collection] as &$doc) {
            $match = true;
            foreach ($filter as $k => $v) {
                if (!isset($doc[$k]) || $doc[$k] !== $v) {
                    $match = false; break;
                }
            }
            if ($match) {
                foreach ($setFields as $sk => $sv) {
                    $doc[$sk] = $sv;
                }
                file_put_contents($this->fallbackDataFile, json_encode($data, JSON_PRETTY_PRINT));
                return 1;
            }
        }
        return 0;
    }

    private function fallbackDeleteOne($collection, $filter) {
        if (!file_exists($this->fallbackDataFile)) return 0;
        $data = json_decode(file_get_contents($this->fallbackDataFile), true) ?? [];
        if (!isset($data[$collection])) return 0;

        foreach ($data[$collection] as $idx => $doc) {
            $match = true;
            foreach ($filter as $k => $v) {
                if (!isset($doc[$k]) || $doc[$k] !== $v) {
                    $match = false; break;
                }
            }
            if ($match) {
                array_splice($data[$collection], $idx, 1);
                file_put_contents($this->fallbackDataFile, json_encode($data, JSON_PRETTY_PRINT));
                return 1;
            }
        }
        return 0;
    }
}

$db = MongoDBConnection::getInstance();
